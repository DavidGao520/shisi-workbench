#!/usr/bin/env node
// Local candidate delivery only. No model API, shell execution, or inventory access.
import { createServer } from 'node:http';
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const PROTOCOL = 'zhonghua-shisi-bridge-1';
export const PORT = 43117;
const MAX_BODY = 200000;
const uuid = (v) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const strings = (v) =>
  Array.isArray(v) &&
  v.length <= 30 &&
  v.every((x) => typeof x === 'string' && x.length <= 300);
const short = (v, max = 120) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const allowed = (v, keys) => Object.keys(v).every((k) => keys.includes(k));
const digest = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function validateExtraction(input, ticket) {
  if (
    !object(input) ||
    !allowed(input, [
      'schemaVersion',
      'requestId',
      'dataset',
      'mode',
      'source',
      'createdAt',
      'transcript',
      'warnings',
      'candidates',
    ])
  )
    fail('候选文件含未知字段。');
  if (
    input.schemaVersion !== '1.0' ||
    !['workbuddy-image', 'workbuddy-voice-transcript'].includes(input.source)
  )
    fail('只接收 WorkBuddy 图片或核对过的文字提取结果。');
  if (
    (input.dataset !== undefined && input.dataset !== ticket.dataset) ||
    (input.mode !== undefined && input.mode !== ticket.mode)
  )
    fail('候选与本次厨房或盘点方式不一致。');
  if (
    !strings(input.warnings) ||
    !Array.isArray(input.candidates) ||
    input.candidates.length > 50
  )
    fail('候选必须为 0–50 项，并附 warnings 数组。');
  if (
    input.transcript !== undefined &&
    (typeof input.transcript !== 'string' || input.transcript.length > 10000)
  )
    fail('转写文字无效。');
  if (
    input.source === 'workbuddy-voice-transcript' &&
    !short(input.transcript, 10000)
  )
    fail('文字识别需保留原始转写。');
  const ids = new Set();
  for (const c of input.candidates) {
    if (
      !object(c) ||
      !allowed(c, [
        'candidateId',
        'displayName',
        'canonicalIngredientId',
        'rawMention',
        'amount',
        'unit',
        'amountBand',
        'confidence',
        'warnings',
      ])
    )
      fail('候选含未知字段，不能提交确认标记或库存命令。');
    if (
      !short(c.candidateId) ||
      ids.has(c.candidateId.trim()) ||
      !short(c.displayName, 60) ||
      !strings(c.warnings)
    )
      fail('候选名称、编号或警告格式不正确。');
    ids.add(c.candidateId.trim());
    if (
      c.canonicalIngredientId !== undefined &&
      !short(c.canonicalIngredientId)
    )
      fail('食材编号无效。');
    if (
      c.rawMention !== undefined &&
      (!short(c.rawMention, 500) ||
        (input.transcript !== undefined &&
          !input.transcript.includes(c.rawMention)))
    )
      fail('原始提及必须出自转写原文。');
    if (
      c.amount !== undefined &&
      (typeof c.amount !== 'number' ||
        !Number.isFinite(c.amount) ||
        c.amount < 0 ||
        c.amount > 1000000 ||
        !short(c.unit, 30) ||
        c.amountBand !== undefined)
    )
      fail('数量必须是非负数，搭配单位，不得混用数量档。');
    if (c.unit !== undefined && !short(c.unit, 30)) fail('单位无效。');
    if (
      c.amountBand !== undefined &&
      !['充足', '少量', '即将用完'].includes(c.amountBand)
    )
      fail('数量档无效。');
    if (
      c.confidence !== undefined &&
      (typeof c.confidence !== 'number' ||
        !Number.isFinite(c.confidence) ||
        c.confidence < 0 ||
        c.confidence > 1)
    )
      fail('置信度无效。');
  }
  // The UI-owned ticket, never model output, binds routing and replay identity.
  return {
    schemaVersion: '1.0',
    requestId: 'wb-' + ticket.id,
    dataset: ticket.dataset,
    mode: ticket.mode,
    source: input.source,
    createdAt: ticket.createdAt,
    ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
    warnings: input.warnings,
    candidates: input.candidates,
  };
}

async function atomicJson(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) fail('内容超过 200 KB，请分批识别。', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('需要有效 JSON。');
  }
}
function secretMatches(header, token) {
  const a = Buffer.from(header || ''),
    b = Buffer.from('Bearer ' + token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startBridge({
  workspace,
  port = PORT,
  now = () => Date.now(),
}) {
  const root = resolve(workspace);
  let html;
  for (const path of [
    join(root, '中华食肆.html'),
    join(root, 'release', '中华食肆.html'),
  ]) {
    try {
      html = await readFile(path, 'utf8');
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (!html)
    fail('找不到中华食肆.html，请传入完整工作台目录或先运行 build:html。');
  const dir = join(root, '.kitchen-bridge');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) fail('连接数据目录不能是符号链接。');
  const queuePath = join(dir, 'queue.json');
  let state = {
    protocol: PROTOCOL,
    workspaceId: randomUUID(),
    active: null,
    entries: [],
  };
  try {
    const raw = await readFile(queuePath, 'utf8');
    if (raw.length > 5000000) fail('连接队列过大，已停止，未覆盖数据。');
    const saved = JSON.parse(raw);
    if (
      saved.protocol !== PROTOCOL ||
      !uuid(saved.workspaceId) ||
      !Array.isArray(saved.entries) ||
      saved.entries.length > 100
    )
      fail('连接队列版本或结构异常，未覆盖数据。');
    state = saved;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const token = randomBytes(32).toString('hex');
  let serial = Promise.resolve();
  const transact = (fn) => {
    const operation = serial.then(async () => {
      const next = structuredClone(state);
      const result = fn(next);
      await atomicJson(queuePath, next);
      state = next;
      return result;
    });
    serial = operation.catch(() => {});
    return operation;
  };
  const active = () =>
    state.active && state.active.expiresAt > now() ? state.active : null;
  const server = createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (req.headers.host !== new URL(origin).host)
        fail('Host 不受信任。', 403);
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        });
        res.end(
          html.replace(
            '<head>',
            '<head><meta name="kitchen-workspace" content="' +
              state.workspaceId +
              '">',
          ),
        );
        return;
      }
      if (req.headers.origin && req.headers.origin !== origin)
        fail('不接受跨站请求。', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site')
        fail('不接受跨站请求。', 403);
      if (req.method === 'OPTIONS') fail('不接受跨站预检。', 403);
      const agentPath = [
        '/bridge/agent-status',
        '/bridge/submit',
        '/bridge/stop',
      ].includes(path);
      const client = req.headers['x-kitchen-client'];
      if (agentPath) {
        if (!secretMatches(req.headers.authorization, token))
          fail('连接凭证无效，请用配套脚本操作。', 401);
      } else if (!uuid(client)) fail('请从本机工作台页面访问。', 403);
      if (req.method === 'GET' && path === '/bridge/agent-status') {
        const t = active();
        json(200, {
          protocol: PROTOCOL,
          origin,
          workspaceId: state.workspaceId,
          active: t
            ? {
                id: t.id,
                dataset: t.dataset,
                mode: t.mode,
                expiresAt: t.expiresAt,
              }
            : null,
          receipts: state.entries
            .slice(-5)
            .map((e) => ({ ticketId: e.id, status: e.status })),
        });
      } else if (req.method === 'GET' && path === '/bridge/status') {
        const t = active();
        json(200, {
          protocol: PROTOCOL,
          workspaceId: state.workspaceId,
          active:
            t?.client === client
              ? {
                  id: t.id,
                  dataset: t.dataset,
                  mode: t.mode,
                  expiresAt: t.expiresAt,
                }
              : null,
          otherActive: !!t && t.client !== client,
          pending: state.entries.filter(
            (e) => e.client === client && e.status === 'pending',
          ).length,
        });
      } else if (req.method === 'POST' && path === '/bridge/intake') {
        const data = await body(req);
        if (
          !object(data) ||
          !['real', 'demo'].includes(data.dataset) ||
          !['stocktake', 'restock'].includes(data.mode)
        )
          fail('厨房或盘点方式无效。');
        const ticket = await transact((next) => {
          if (
            next.entries.some(
              (e) => e.client === client && e.status === 'pending',
            )
          )
            fail('上一份识别结果尚未接收，请先回到对应厨房。', 409);
          if (next.active && next.active.expiresAt > now()) {
            if (
              next.active.client === client &&
              next.active.dataset === data.dataset &&
              next.active.mode === data.mode
            )
              return next.active;
            fail('另一次识别仍在等待，请先取消或完成。', 409);
          }
          next.active = {
            id: randomUUID(),
            client,
            dataset: data.dataset,
            mode: data.mode,
            createdAt: new Date(now()).toISOString(),
            expiresAt: now() + 30 * 60 * 1000,
          };
          return next.active;
        });
        json(200, {
          ticket: {
            id: ticket.id,
            dataset: ticket.dataset,
            mode: ticket.mode,
            expiresAt: ticket.expiresAt,
          },
        });
      } else if (req.method === 'POST' && path === '/bridge/cancel') {
        const data = await body(req);
        await transact((next) => {
          if (
            next.active?.client !== client ||
            next.active?.id !== data.ticketId
          )
            fail('等待任务已改变，请刷新。', 409);
          next.active = null;
        });
        json(200, { cancelled: true });
      } else if (req.method === 'POST' && path === '/bridge/reset-preview') {
        const data = await body(req);
        if (!object(data) || !['real', 'demo'].includes(data.dataset))
          fail('厨房无效。');
        const ticketIds = state.entries
          .filter((e) => e.client === client && e.dataset === data.dataset)
          .map((e) => e.id);
        if (
          state.active?.client === client &&
          state.active.dataset === data.dataset
        )
          ticketIds.push(state.active.id);
        // Read-only: retain pending payloads until the page's reset transaction commits.
        json(200, { ticketIds });
      } else if (req.method === 'POST' && path === '/bridge/discard') {
        const data = await body(req);
        if (
          !object(data) ||
          !['real', 'demo'].includes(data.dataset) ||
          !Array.isArray(data.ticketIds) ||
          data.ticketIds.length > 100 ||
          !data.ticketIds.every(uuid)
        )
          fail('厨房无效。');
        const ticketIds = await transact((next) => {
          const ids = next.entries
            .filter(
              (e) =>
                e.client === client &&
                e.dataset === data.dataset &&
                data.ticketIds.includes(e.id),
            )
            .map((e) => e.id);
          if (
            next.active?.client === client &&
            next.active?.dataset === data.dataset &&
            data.ticketIds.includes(next.active.id)
          ) {
            ids.push(next.active.id);
            next.active = null;
          }
          for (const entry of next.entries.filter(
            (e) => ids.includes(e.id) && e.status === 'pending',
          )) {
            entry.status = 'discarded';
            delete entry.envelope;
          }
          return ids;
        });
        json(200, { ticketIds });
      } else if (req.method === 'POST' && path === '/bridge/submit') {
        const data = await body(req);
        if (!object(data) || !uuid(data.ticketId)) fail('需要有效 ticketId。');
        const result = await transact((next) => {
          const previous = next.entries.find((e) => e.id === data.ticketId);
          const ticket = previous || next.active;
          if (!ticket || ticket.id !== data.ticketId)
            fail('没有对应的等待任务，请先在页面开启接收。', 409);
          const envelope = validateExtraction(data.extraction, ticket);
          const hash = digest(envelope);
          if (previous) {
            if (previous.hash !== hash)
              fail('同一次识别已提交不同结果，请开始新一次识别。', 409);
            return {
              ticketId: ticket.id,
              status: previous.status,
              duplicate: true,
            };
          }
          if (ticket.expiresAt <= now())
            fail('等待已过期，请在页面重新开始。', 409);
          if (next.entries.filter((e) => e.status === 'pending').length >= 20)
            fail('待接收结果过多，请先处理已有结果。', 409);
          next.entries = next.entries
            .filter((e) => e.status === 'pending')
            .concat(
              next.entries.filter((e) => e.status !== 'pending').slice(-49),
            );
          next.entries.push({ ...ticket, envelope, hash, status: 'pending' });
          next.active = null;
          return { ticketId: ticket.id, status: 'pending', duplicate: false };
        });
        json(200, result);
      } else if (req.method === 'GET' && path === '/bridge/next') {
        const entry = state.entries.find(
          (e) => e.client === client && e.status === 'pending',
        );
        json(200, {
          entry: entry
            ? { ticketId: entry.id, envelope: entry.envelope }
            : null,
        });
      } else if (req.method === 'POST' && path === '/bridge/ack') {
        const data = await body(req);
        if (
          !object(data) ||
          !['staged', 'invalid', 'empty'].includes(data.status)
        )
          fail('回执状态无效。');
        await transact((next) => {
          const entry = next.entries.find(
            (e) => e.id === data.ticketId && e.client === client,
          );
          if (!entry) fail('结果不存在。', 404);
          if (entry.status !== 'pending' && entry.status !== data.status)
            fail('回执冲突。', 409);
          entry.status = data.status;
          delete entry.envelope; // Keep only identity/hash/receipt for retries; not a second inventory.
        });
        json(200, { acknowledged: true });
      } else if (req.method === 'POST' && path === '/bridge/stop') {
        json(200, { stopped: true });
        server.close();
      } else fail('不存在此接口。', 404);
    } catch (e) {
      if (!res.headersSent)
        json(e.status || 500, {
          error: e.status ? e.message : '本地保存失败，请重试；未确认入库。',
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  await new Promise((ok, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', ok);
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    await atomicJson(queuePath, state);
    await atomicJson(join(dir, 'runtime.json'), {
      protocol: PROTOCOL,
      origin,
      token,
      workspaceId: state.workspaceId,
    });
  } catch (e) {
    server.close();
    throw e;
  }
  return {
    origin,
    workspaceId: state.workspaceId,
    close: () =>
      new Promise((ok, no) => server.close((e) => (e ? no(e) : ok()))),
  };
}

export async function agentRequest(workspace, path, data) {
  const config = JSON.parse(
    await readFile(
      join(resolve(workspace), '.kitchen-bridge/runtime.json'),
      'utf8',
    ),
  );
  if (
    config.protocol !== PROTOCOL ||
    !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(config.origin) ||
    !/^[a-f0-9]{64}$/.test(config.token)
  )
    fail('本地连接配置无效。');
  const response = await fetch(config.origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + config.token,
      'Content-Type': 'application/json',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok) fail(result.error || '本地连接失败。', response.status);
  return result;
}

async function cli() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !['--workspace', '--file', '--ticket'].includes(args[i]) ||
      !args[i + 1]
    )
      fail('参数应为 --workspace 目录、--file 文件、--ticket 编号。');
    options[args[i]] = args[i + 1];
  }
  const workspace = resolve(options['--workspace'] || process.cwd());
  if (command === 'serve') {
    const running = await startBridge({ workspace });
    console.log(
      JSON.stringify({
        protocol: PROTOCOL,
        origin: running.origin,
        status: 'listening',
      }),
    );
  } else if (command === 'start') {
    try {
      console.log(
        JSON.stringify(await agentRequest(workspace, '/bridge/agent-status')),
      );
      return;
    } catch {
      /* Stale connection: start only this workspace, never terminate another process. */
    }
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), 'serve', '--workspace', workspace],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    for (let i = 0; i < 30; i++) {
      await new Promise((ok) => setTimeout(ok, 100));
      try {
        console.log(
          JSON.stringify(await agentRequest(workspace, '/bridge/agent-status')),
        );
        return;
      } catch {
        /* Await startup; bounded to three seconds. */
      }
    }
    fail(
      '连接未启动：检查目录内 HTML 和 Node.js；43117 若被占用，请先关闭原工作台连接。未更换端口或覆盖库存。',
    );
  } else if (command === 'status')
    console.log(
      JSON.stringify(await agentRequest(workspace, '/bridge/agent-status')),
    );
  else if (command === 'submit') {
    if (!options['--file'] || !uuid(options['--ticket']))
      fail('submit 需要 --file 和 --ticket。');
    const raw = await readFile(resolve(options['--file']), 'utf8');
    if (Buffer.byteLength(raw) > MAX_BODY - 100) fail('候选文件过大。', 413);
    const extraction = JSON.parse(raw);
    console.log(
      JSON.stringify(
        await agentRequest(workspace, '/bridge/submit', {
          ticketId: options['--ticket'],
          extraction,
        }),
      ),
    );
  } else if (command === 'stop')
    console.log(
      JSON.stringify(await agentRequest(workspace, '/bridge/stop', {})),
    );
  else
    fail(
      '用法：node kitchen-bridge.mjs start|status|submit|stop --workspace 工作台目录。照片在 WorkBuddy 对话上传。',
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  cli().catch((e) => {
    console.error(
      e.status
        ? e.message
        : '无法连接本地工作台或读取候选文件，请核对目录并启动连接。',
    );
    process.exitCode = 1;
  });
}
