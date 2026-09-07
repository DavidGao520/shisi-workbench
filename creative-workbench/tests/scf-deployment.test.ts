import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import {
  main,
  publicConfig,
  runtimePolicy,
  deploymentPolicy,
  TRUST_POLICY,
  createTencentApi,
  deployVoice,
  waitActive,
  functionUrl,
  packageCode,
  CODE_FILES,
} from '../scripts/deploy-voice-scf.mjs';
import { QUOTA_LIFECYCLE } from '../scf/voice-backend/cos-store.mjs';

const config = publicConfig({
  VOICE_QUOTA_BUCKET: 'fixture-123',
  SCF_OWNER_UIN: '456',
});
const origin = 'https://123-fixture.ap-guangzhou.tencentscf.com';
const trigger = () => ({
  Type: 'http',
  Enable: 1,
  Qualifier: '$LATEST',
  AvailableStatus: 'Available',
  TriggerDesc: JSON.stringify({
    AuthType: 'NONE',
    NetConfig: {
      EnableExtranet: true,
      EnableIntranet: false,
      ExtranetUrl: origin,
    },
  }),
});
const asr = { secretId: 'fixture-asr-id', secretKey: 'fixture-asr-secret' };
type ApiPayload = {
  Environment?: { Variables: { Key: string; Value: string }[] };
  ShowCode?: string;
  ReservedConcurrencyMem?: number;
};
function fixture() {
  let exists = false;
  let pending = 0;
  let triggers: ReturnType<typeof trigger>[] = [];
  const calls: { service: string; action: string; payload: ApiPayload }[] = [];
  const api = async (service: string, action: string, payload: ApiPayload) => {
    calls.push({ service, action, payload });
    if (action === 'GetUserAppId') {
      assert.equal(service, 'cam');
      return { AppId: 123, OwnerUin: '456' };
    }
    if (action === 'GetRole')
      return { RoleInfo: { PolicyDocument: JSON.stringify(TRUST_POLICY) } };
    if (action === 'ListAttachedRolePolicies')
      return { List: [{ PolicyId: 1 }], TotalNum: 1 };
    if (action === 'GetPolicy')
      return { PolicyDocument: JSON.stringify(runtimePolicy(config)) };
    if (action === 'GetFunction') {
      assert.equal(payload.ShowCode, 'FALSE');
      if (!exists)
        throw Object.assign(new Error('absent'), {
          code: 'ResourceNotFound.FunctionName',
        });
      const status = pending ? 'Updating' : 'Active';
      if (pending) pending--;
      return {
        Status: status,
        Type: 'Event',
        Runtime: 'Nodejs20.19',
        Role: config.role,
        Triggers: triggers,
      };
    }
    assert.equal(pending, 0, 'a write was attempted before Active');
    if (
      [
        'CreateFunction',
        'UpdateFunctionConfiguration',
        'UpdateFunctionCode',
      ].includes(action)
    ) {
      for (const variable of payload.Environment?.Variables || [])
        assert.notEqual(variable.Value, '');
      exists = true;
      pending = 1;
      return {};
    }
    if (action === 'PutReservedConcurrencyConfig') {
      assert.equal(payload.ReservedConcurrencyMem, 128);
      return {};
    }
    if (action === 'GetReservedConcurrencyConfig') return { ReservedMem: 128 };
    if (action === 'CreateTrigger') {
      triggers = [trigger()];
      return {};
    }
    assert.fail('unexpected API action ' + action);
  };
  const cosRequest = async (
    method: string,
    path: string,
    options: { query: Record<string, string> },
  ) => {
    assert.equal(method, 'GET');
    assert.equal(path, '/');
    return new Response(
      Object.hasOwn(options.query, 'versioning')
        ? '<VersioningConfiguration/>'
        : QUOTA_LIFECYCLE,
    );
  };
  const probe = async (url: unknown) => {
    assert.equal(url, origin + '/api/voice/status');
    return Response.json({ ready: true, engine: 'tencent-cloud-asr' });
  };
  return { api, cosRequest, probe, calls };
}

void test('deployment default/import/check is offline; requires explicit costs flag', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('check must not use network');
  try {
    await main(['--check']);
    await assert.rejects(main(['--apply']));
  } finally {
    globalThis.fetch = saved;
  }
});

void test('first deployment and redeployment wait for Active and never mutate IAM/COS', async () => {
  const f = fixture();
  const result = await deployVoice({
    config,
    asr: { secretId: ' ' + asr.secretId, secretKey: asr.secretKey + ' ' },
    ...f,
    pause: async () => {},
  });
  const credentials = f.calls.find((c) => c.action === 'CreateFunction')!
    .payload.Environment!.Variables;
  assert.equal(
    credentials.find((v) => v.Key === 'TENCENT_SECRET_ID')!.Value,
    asr.secretId,
  );
  assert.equal(
    credentials.find((v) => v.Key === 'TENCENT_SECRET_KEY')!.Value,
    asr.secretKey,
  );
  assert.deepEqual(result, {
    origin,
    transport: 'json-base64',
    realRecordingVerified: false,
  });
  await deployVoice({ config, asr, ...f, pause: async () => {} });
  assert.equal(f.calls.filter((c) => c.action === 'CreateFunction').length, 1);
  assert.equal(f.calls.filter((c) => c.action === 'CreateTrigger').length, 1);
  assert.equal(
    f.calls.filter((c) => c.action === 'UpdateFunctionCode').length,
    1,
  );
  assert.ok(
    f.calls.every((c) => c.service !== 'cam' || /^(Get|List)/.test(c.action)),
  );
  const updates = f.calls.filter(
    (c) => c.action === 'UpdateFunctionConfiguration',
  );
  assert.ok(
    updates.some((c) =>
      c.payload.Environment!.Variables.some(
        (v) => v.Key === 'KITCHEN_VOICE_ENABLED' && v.Value === '0',
      ),
    ),
  );
  assert.ok(
    updates
      .at(-1)!
      .payload.Environment!.Variables.some(
        (v) => v.Key === 'VOICE_ORIGIN' && v.Value === origin,
      ),
  );
});

void test('SCF function names are checked before deployment', () => {
  for (const name of ['a', 'demo-', 'demo_', 'a'.repeat(61)])
    assert.throws(() =>
      publicConfig({
        VOICE_QUOTA_BUCKET: 'fixture-123',
        SCF_OWNER_UIN: '456',
        SCF_FUNCTION_NAME: name,
      }),
    );
  assert.equal(
    publicConfig({
      VOICE_QUOTA_BUCKET: 'fixture-123',
      SCF_OWNER_UIN: '456',
      SCF_FUNCTION_NAME: 'ab',
    }).functionName,
    'ab',
  );
});

void test('identity/config/policy problems fail before any SCF write', async () => {
  for (const wrong of ['identity', 'runtime', 'trust', 'policy', 'namespace']) {
    const f = fixture();
    const api = async (
      service: string,
      action: string,
      payload: ApiPayload,
    ) => {
      if (wrong === 'identity' && action === 'GetUserAppId')
        return { AppId: 999, OwnerUin: '456' };
      if (wrong === 'namespace' && action === 'GetFunction')
        throw Object.assign(new Error('absent'), {
          code: 'ResourceNotFound.Namespace',
        });
      if (wrong === 'runtime' && action === 'GetFunction')
        return {
          Status: 'Active',
          Type: 'Event',
          Runtime: 'Nodejs18.15',
          Role: config.role,
          Triggers: [],
        };
      if (wrong === 'trust' && action === 'GetRole')
        return { RoleInfo: { PolicyDocument: '{}' } };
      if (wrong === 'policy' && action === 'GetPolicy')
        return {
          PolicyDocument:
            '{"statement":[{"action":"*","resource":"*","effect":"allow"}]}',
        };
      return f.api(service, action, payload);
    };
    await assert.rejects(
      deployVoice({ config, asr, ...f, api, pause: async () => {} }),
    );
    assert.ok(
      f.calls.every((c) => c.service !== 'scf' || c.action === 'GetFunction'),
    );
  }
});

void test('equivalent policy ordering and name-prefixed trust actions pass, extra permissions do not', async () => {
  const f = fixture();
  const api = async (service: string, action: string, payload: ApiPayload) => {
    if (action === 'GetRole')
      return {
        RoleInfo: {
          PolicyDocument: JSON.stringify({
            version: '2.0',
            statement: [
              {
                effect: 'allow',
                action: ['name/sts:AssumeRole'],
                principal: { service: 'scf.qcloud.com' },
              },
            ],
          }),
        },
      };
    if (action === 'GetPolicy')
      return {
        PolicyDocument: JSON.stringify({
          version: '2.0',
          statement: runtimePolicy(config).statement.reverse(),
        }),
      };
    return f.api(service, action, payload);
  };
  await deployVoice({ config, asr, ...f, api, pause: async () => {} });
  const policy = deploymentPolicy(config);
  assert.ok(
    policy.statement
      .find((s) => s.resource.includes('*'))!
      .action.includes('scf:GetFunction'),
  );
  assert.ok(
    runtimePolicy(config).statement[0].resource[0].endsWith(
      ':uid/123:fixture-123/*',
    ),
  );
  assert.ok(!JSON.stringify(policy).includes('FullAccess'));
});

void test('function state failures/timeouts and suspicious URLs are never accepted', async () => {
  await assert.rejects(
    waitActive(async () => ({ Status: 'CreateFailed' }), {
      pause: async () => {},
    }),
  );
  await assert.rejects(
    waitActive(async () => ({ Status: 'Updating' }), {
      pause: async () => {},
      attempts: 2,
    }),
  );
  for (const url of [
    'https://evil.invalid/' + origin,
    origin + '?token=x',
    origin + '/other',
    origin.replace('123-', '999-'),
    origin.replace('123-fixture.', '123-fixture.evil.'),
  ]) {
    const t = trigger();
    const desc = JSON.parse(t.TriggerDesc);
    desc.NetConfig.ExtranetUrl = url;
    t.TriggerDesc = JSON.stringify(desc);
    assert.throws(() => functionUrl({ Triggers: [t] }, config));
  }
  assert.throws(() =>
    functionUrl({ Triggers: [{ ...trigger(), Enable: 0 }] }, config),
  );
  assert.throws(() =>
    functionUrl({ Triggers: [{ ...trigger(), Qualifier: '1' }] }, config),
  );
  assert.equal(functionUrl({ Triggers: [trigger()] }, config), origin);
});

void test('Tencent deployment client uses CAM contract/token, rejects redirects, and sanitizes provider errors', async () => {
  const api = createTencentApi({
    region: 'ap-guangzhou',
    secretId: 'fixture-id',
    secretKey: 'fixture-key',
    token: 'fixture-token',
    fetchImpl: async (url: unknown, init?: RequestInit) => {
      assert.equal(url, 'https://cam.tencentcloudapi.com/');
      const h = new Headers(init?.headers);
      assert.equal(h.get('x-tc-version'), '2019-01-16');
      assert.equal(h.get('x-tc-token'), 'fixture-token');
      assert.match(h.get('authorization')!, /\/cam\/tc3_request/);
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      return Response.json({
        Response: {
          Error: {
            Code: 'UnauthorizedOperation',
            Message: 'fixture-key fixture-token private data',
          },
        },
      });
    },
  });
  await assert.rejects(api('cam', 'GetUserAppId', {}), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      'GetUserAppId:UnauthorizedOperation',
    );
    return true;
  });
});

void test('packaged CommonJS entry runs outside the ESM repo and contains no deployment/env files', async () => {
  const files = unzipSync(packageCode());
  assert.deepEqual(Object.keys(files).sort(), [...CODE_FILES].sort());
  const dir = await mkdtemp(join(tmpdir(), 'shisi-scf-entry-'));
  try {
    for (const [name, bytes] of Object.entries(files))
      await writeFile(join(dir, name), bytes);
    const result = execFileSync(
      process.execPath,
      [
        '-e',
        "require('./index.js').main_handler({httpMethod:'GET',path:'/api/voice/status'},{}).then(r=>process.stdout.write(r.body))",
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    assert.equal(JSON.parse(result).ready, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
