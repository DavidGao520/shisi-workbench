// Offline by default. Only --apply --accept-costs may contact Tencent/create SCF resources.
// COS bucket/lifecycle and the narrowly scoped run role must be prepared separately.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import { zipSync } from 'fflate';
import {
  createCosClient,
  assertUnversioned,
  assertSafeLifecycle,
  QUOTA_LIFECYCLE,
} from '../scf/voice-backend/cos-store.mjs';

export const RUNTIME = 'Nodejs20.19';
export const CODE_FILES = [
  'index.js',
  'handler.mjs',
  'speech.mjs',
  'quota.mjs',
  'cos-store.mjs',
  'wav.mjs',
];
export const TRUST_POLICY = {
  version: '2.0',
  statement: [
    {
      effect: 'allow',
      principal: { service: ['scf.qcloud.com'] },
      action: 'sts:AssumeRole',
    },
  ],
};
const fail = (code) => Object.assign(new Error(code), { code });

export function publicConfig(env) {
  const bucket = env.VOICE_QUOTA_BUCKET?.trim();
  const appId = bucket?.match(/-(\d+)$/)?.[1];
  const region = env.VOICE_QUOTA_REGION?.trim() || 'ap-guangzhou';
  const owner = env.SCF_OWNER_UIN?.trim();
  const role = env.SCF_ROLE_NAME?.trim() || 'shisi-voice-scf-role';
  const functionName = env.SCF_FUNCTION_NAME?.trim() || 'shisi-voice-backend';
  const dailyLimit = Number(env.KITCHEN_VOICE_DAILY_LIMIT || '100');
  if (
    !bucket ||
    !/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket) ||
    !/^\d+$/.test(owner || '') ||
    !/^[a-z]+-[a-z]+(?:-\d+)?$/.test(region) ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(role) ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,58}[A-Za-z0-9]$/.test(functionName) ||
    !Number.isSafeInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 1000
  )
    throw fail(
      '请先配置 VOICE_QUOTA_BUCKET、SCF_OWNER_UIN 及有效的地域/名称/每日限额。',
    );
  return { bucket, appId, region, owner, role, functionName, dailyLimit };
}
export function runtimePolicy(c) {
  const resource = `qcs::cos:${c.region}:uid/${c.appId}:${c.bucket}`;
  return {
    version: '2.0',
    statement: [
      {
        effect: 'allow',
        action: ['cos:GetBucketVersioning', 'cos:GetBucketLifecycle'],
        resource: [resource + '/*'],
      },
      {
        effect: 'allow',
        action: ['cos:PutObject'],
        resource: [resource + '/voice-usage/*'],
      },
    ],
  };
}
export function deploymentPolicy(c) {
  const scfResource = `qcs::scf:${c.region}:uin/${c.owner}:namespace/default/function/${c.functionName}`;
  return {
    version: '2.0',
    statement: [
      // Some SCF/CAM actions support operation-level authorization only. Not full access.
      {
        effect: 'allow',
        action: [
          'scf:GetFunction',
          'scf:CreateFunction',
          'scf:UpdateFunctionCode',
          'scf:UpdateFunctionConfiguration',
          'scf:CreateTrigger',
          'cam:GetUserAppId',
          'cam:GetRole',
          'cam:GetPolicy',
          'cam:ListAttachedRolePolicies',
        ],
        resource: ['*'],
      },
      {
        effect: 'allow',
        action: [
          'scf:PutReservedConcurrencyConfig',
          'scf:GetReservedConcurrencyConfig',
        ],
        resource: [scfResource],
      },
      {
        effect: 'allow',
        action: ['cam:PassRole'],
        resource: [`qcs::cam::uin/${c.owner}:roleName/${c.role}`],
      },
      runtimePolicy(c).statement[0],
    ],
  };
}
export function packageCode() {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        CODE_FILES.map((name) => [
          name,
          readFileSync(
            new URL('../scf/voice-backend/' + name, import.meta.url),
          ),
        ]),
      ),
    ),
  );
}
/** @param {{secretId: string, secretKey: string, token?: string, region: string, fetchImpl?: typeof fetch}} options */
export function createTencentApi({
  secretId,
  secretKey,
  token,
  region,
  fetchImpl = fetch,
}) {
  return async (service, action, payload) => {
    if (!['scf', 'cam'].includes(service)) throw fail('unsupported-service');
    const host = `${service}.tencentcloudapi.com`;
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload);
    const contentType = 'application/json; charset=utf-8';
    const digest = (s) => createHash('sha256').update(s).digest('hex');
    const hmac = (k, v) => createHmac('sha256', k).update(v).digest();
    const canonical = `POST\n/\n\ncontent-type:${contentType}\nhost:${host}\n\ncontent-type;host\n${digest(body)}`;
    const scope = `${date}/${service}/tc3_request`;
    const toSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${digest(canonical)}`;
    const key = hmac(
      hmac(hmac('TC3' + secretKey, date), service),
      'tc3_request',
    );
    const signature = createHmac('sha256', key).update(toSign).digest('hex');
    const response = await fetchImpl(`https://${host}/`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-TC-Action': action,
        'X-TC-Version': service === 'cam' ? '2019-01-16' : '2018-04-16',
        'X-TC-Timestamp': String(timestamp),
        ...(service === 'scf' ? { 'X-TC-Region': region } : {}),
        ...(token ? { 'X-TC-Token': token } : {}),
        Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw fail(`${action}:HTTP-${response.status}`);
    }
    const result = (await response.json()).Response;
    if (!result) throw fail(`${action}:invalid-response`);
    if (result.Error) {
      const code = /^[A-Za-z0-9.]{1,100}$/.test(result.Error.Code)
        ? result.Error.Code
        : 'provider-error';
      // Never print provider Message, response Environment, request payload or secrets.
      throw Object.assign(new Error(`${action}:${code}`), { code });
    }
    return result;
  };
}
function policyDocument(value) {
  if (typeof value !== 'string') throw fail('invalid-policy');
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      throw fail('invalid-policy');
    }
  }
}
function canonical(value, key = '') {
  if (['action', 'resource', 'service'].includes(key)) {
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((v) =>
        typeof v === 'string' && key === 'action'
          ? v.replace(/^name\//, '')
          : v,
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (Array.isArray(value))
    return value
      .map((v) => canonical(v))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k], k)]),
    );
  return value;
}
function samePolicy(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export async function verifyRole(api, c) {
  const result = await api('cam', 'GetRole', { RoleName: c.role });
  if (
    !samePolicy(policyDocument(result.RoleInfo?.PolicyDocument), TRUST_POLICY)
  )
    throw fail('运行角色信任策略与专用 SCF 模板不符，请人工审核。');
  const attached = [];
  for (let page = 1; page <= 20; page++) {
    const result = await api('cam', 'ListAttachedRolePolicies', {
      RoleName: c.role,
      Page: page,
      Rp: 200,
    });
    if (!Array.isArray(result.List) || !Number.isSafeInteger(result.TotalNum))
      throw fail('invalid-role-policies');
    attached.push(...result.List);
    if (attached.length >= result.TotalNum) break;
    if (!result.List.length || page === 20)
      throw fail('role-policy-pagination-incomplete');
  }
  if (attached.length !== 1)
    throw fail('专用运行角色必须只绑定一份已审核的 COS 配额策略。');
  const detail = await api('cam', 'GetPolicy', {
    PolicyId: attached[0].PolicyId,
  });
  if (!samePolicy(policyDocument(detail.PolicyDocument), runtimePolicy(c)))
    throw fail('运行角色权限不匹配，请使用 --plan 输出的限定策略。');
}
export async function waitActive(
  get,
  { pause = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 30 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const detail = await get();
    if (detail.Status === 'Active') return detail;
    if (!['Creating', 'Updating', 'Publishing'].includes(detail.Status))
      throw fail('function-state-not-active');
    await pause(Math.min(1000 + attempt * 500, 3000));
  }
  throw fail('function-state-timeout');
}
export function functionUrl(detail, c) {
  const http = (detail.Triggers || []).filter((t) => t.Type === 'http');
  if (!http.length) return null;
  if (http.length !== 1) throw fail('multiple-function-urls');
  const trigger = http[0];
  const desc = policyDocument(trigger.TriggerDesc);
  if (
    (trigger.Qualifier && trigger.Qualifier !== '$LATEST') ||
    ![1, 'OPEN', true].includes(trigger.Enable) ||
    (trigger.AvailableStatus && trigger.AvailableStatus !== 'Available') ||
    desc.AuthType !== 'NONE' ||
    desc.NetConfig?.EnableExtranet !== true ||
    desc.NetConfig.EnableIntranet !== false ||
    desc.ApiGwCompatible === true ||
    desc.EnableSimpleMode === true ||
    desc.CorsConfig?.Enable === true
  )
    throw fail('existing-function-url-config-mismatch');
  if (!desc.NetConfig.ExtranetUrl) return null;
  const url = new URL(desc.NetConfig.ExtranetUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !new RegExp(
      `^${c.appId}-[a-z0-9-]+\\.${c.region}\\.tencentscf\\.com$`,
    ).test(url.hostname)
  )
    throw fail('invalid-function-url');
  return url.origin;
}
export async function deployVoice({
  config: c,
  asr,
  api,
  cosRequest,
  code = packageCode(),
  pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  probe = fetch,
}) {
  if (!asr.secretId?.trim() || !asr.secretKey?.trim())
    throw fail('asr-credentials-required');
  asr = {
    ...asr,
    secretId: asr.secretId.trim(),
    secretKey: asr.secretKey.trim(),
  };
  const identity = await api('cam', 'GetUserAppId', {});
  if (
    String(identity.AppId) !== c.appId ||
    String(identity.OwnerUin) !== c.owner
  )
    throw fail('deployment-account-mismatch');
  await verifyRole(api, c);
  await assertUnversioned(cosRequest);
  await assertSafeLifecycle(cosRequest);
  const target = { FunctionName: c.functionName, Namespace: 'default' };
  const get = () =>
    api('scf', 'GetFunction', {
      ...target,
      Qualifier: '$LATEST',
      ShowCode: 'FALSE',
    });
  let existing;
  try {
    existing = await get();
  } catch (e) {
    if (
      !['ResourceNotFound.Function', 'ResourceNotFound.FunctionName'].includes(
        e.code,
      )
    )
      throw e;
  }
  if (existing) {
    existing = await waitActive(get, { pause });
    if (
      existing.Type !== 'Event' ||
      existing.Runtime !== RUNTIME ||
      existing.Role !== c.role
    )
      throw fail('existing-function-type-runtime-role-mismatch');
    functionUrl(existing, c); // Never silently repurpose an unrelated/private trigger.
  }
  const environment = (enabled, origin = '') => ({
    Variables: [
      { Key: 'TENCENT_SECRET_ID', Value: asr.secretId },
      { Key: 'TENCENT_SECRET_KEY', Value: asr.secretKey },
      ...(asr.token?.trim()
        ? [{ Key: 'TENCENT_SESSION_TOKEN', Value: asr.token.trim() }]
        : []),
      { Key: 'KITCHEN_VOICE_ENABLED', Value: enabled ? '1' : '0' },
      { Key: 'KITCHEN_VOICE_DAILY_LIMIT', Value: String(c.dailyLimit) },
      ...(origin ? [{ Key: 'VOICE_ORIGIN', Value: origin }] : []),
      { Key: 'VOICE_QUOTA_BUCKET', Value: c.bucket },
      { Key: 'VOICE_QUOTA_REGION', Value: c.region },
    ],
  });
  const config = { ...target, MemorySize: 128, Timeout: 60, Role: c.role };
  if (!existing) {
    await api('scf', 'CreateFunction', {
      ...config,
      Type: 'Event',
      Runtime: RUNTIME,
      Handler: 'index.main_handler',
      Environment: environment(false),
      Code: { ZipFile: code.toString('base64') },
      Description: '食肆工作台独立语音后端',
    });
    await waitActive(get, { pause });
  } else {
    // Disable before updating. An interrupted deployment remains fail-closed.
    await api('scf', 'UpdateFunctionConfiguration', {
      ...config,
      Environment: environment(false),
    });
    await waitActive(get, { pause });
    await api('scf', 'UpdateFunctionCode', {
      ...target,
      Handler: 'index.main_handler',
      Code: { ZipFile: code.toString('base64') },
    });
    await waitActive(get, { pause });
  }
  await api('scf', 'PutReservedConcurrencyConfig', {
    ...target,
    ReservedConcurrencyMem: 128,
  });
  const quota = await api('scf', 'GetReservedConcurrencyConfig', target);
  if (quota.ReservedMem !== 128) throw fail('reserved-concurrency-not-applied');
  let detail = await get();
  let origin = functionUrl(detail, c);
  if (!(detail.Triggers || []).some((t) => t.Type === 'http')) {
    await api('scf', 'CreateTrigger', {
      ...target,
      Qualifier: '$LATEST',
      TriggerName: 'func_url',
      Type: 'http',
      Enable: 'OPEN',
      TriggerDesc: JSON.stringify({
        AuthType: 'NONE',
        NetConfig: { EnableExtranet: true, EnableIntranet: false },
      }),
    });
  }
  for (let i = 0; !origin && i < 15; i++) {
    if (pause) await pause(1000);
    else await new Promise((r) => setTimeout(r, 1000));
    detail = await get();
    origin = functionUrl(detail, c);
  }
  if (!origin) throw fail('function-url-not-ready');
  await api('scf', 'UpdateFunctionConfiguration', {
    ...config,
    Environment: environment(true, origin),
  });
  await waitActive(get, { pause });
  const response = await probe(origin + '/api/voice/status', {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw fail('live-status-unavailable');
  }
  const status = await response.json();
  if (status.ready !== true || status.engine !== 'tencent-cloud-asr')
    throw fail('live-status-not-ready');
  return { origin, transport: 'json-base64', realRecordingVerified: false };
}

export async function main(args = process.argv.slice(2)) {
  if (!args.length || (args.length === 1 && args[0] === '--check')) {
    const archive = packageCode();
    console.log(
      `离线代码包检查完成（${CODE_FILES.length} 个白名单文件，${archive.length} 字节）。未联网、未读取 .env、未部署。`,
    );
    return;
  }
  if (args.includes('--help')) {
    console.log(
      '--check：离线检查；--plan：输出公开配置/权限模板；--apply --accept-costs：部署独立 SCF。先阅读 scf/voice-backend/README.md。',
    );
    return;
  }
  const apply =
    args.length === 2 &&
    args.includes('--apply') &&
    args.includes('--accept-costs');
  if (!apply && !(args.length === 1 && args[0] === '--plan'))
    throw fail('部署须明确使用 --apply --accept-costs；默认仅离线检查。');
  let local = {};
  try {
    local = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw fail('env-read-failed');
  }
  const env = { ...local, ...process.env };
  const config = publicConfig(env);
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          config,
          trustPolicy: TRUST_POLICY,
          runtimePolicy: runtimePolicy(config),
          deploymentPolicy: deploymentPolicy(config),
          lifecycle: QUOTA_LIFECYCLE,
        },
        null,
        2,
      ),
    );
    return;
  }
  const secretId = env.SCF_DEPLOY_SECRET_ID?.trim();
  const secretKey = env.SCF_DEPLOY_SECRET_KEY?.trim();
  if (!secretId || !secretKey) throw fail('deployment-credentials-required');
  const credentials = {
    secretId,
    secretKey,
    token: env.SCF_DEPLOY_SESSION_TOKEN?.trim(),
    region: config.region,
  };
  const result = await deployVoice({
    config,
    asr: {
      secretId: env.TENCENT_SECRET_ID,
      secretKey: env.TENCENT_SECRET_KEY,
      token: env.TENCENT_SESSION_TOKEN,
    },
    api: createTencentApi(credentials),
    cosRequest: createCosClient({ ...credentials, bucket: config.bucket }),
  });
  console.log(JSON.stringify(result));
  console.log(
    '尚需真实录音和 Windows 验收；未修改 ZIP 的目标地址，也未发布 Sites。',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.code || 'deploy-failed');
    process.exitCode = 1;
  });
