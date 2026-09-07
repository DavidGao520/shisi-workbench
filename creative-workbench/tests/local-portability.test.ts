import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  voicePython,
  voiceEnvironment,
  requireNode,
} from '../skills/zhonghua-shisi/scripts/runtime-paths.mjs';
import {
  startBridge,
  agentRequest,
} from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import { releaseFiles, releasePaths } from '../scripts/release-files.mjs';
import { WorkBuddyBridge, type Delivery } from '../lib/workbuddy-bridge';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);

void test(
  'cold detached start survives CLI exit, refuses another workspace and preserves identity after restart',
  { timeout: 20000 },
  async (t) => {
    const base = await mkdtemp(join(tmpdir(), '评委 cold & ! '));
    const workspace = join(base, '厨房 A');
    const other = join(base, '厨房 B');
    for (const dir of [workspace, other, base]) {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, '中华食肆.html'),
        '<html><head></head><body>test fixture</body></html>',
      );
    }
    // Use an ephemeral test port in a disposable script copy, never the user's 43117.
    const probe = await startBridge({ workspace: base, port: 0 });
    const port = new URL(probe.origin).port;
    await probe.close();
    const scripts = join(base, 'scripts');
    await mkdir(scripts);
    for (const [source] of releaseFiles.filter(
      ([source]) => source.startsWith('skills/') && source.endsWith('.mjs'),
    )) {
      const filename = source.split('/').at(-1)!;
      let content = await readFile(resolve(root, source), 'utf8');
      if (filename === 'kitchen-bridge.mjs')
        content = content.replace(
          'export const PORT = 43117;',
          'export const PORT = ' + port + ';',
        );
      await writeFile(join(scripts, filename), content);
    }
    const cli = async (action: string, directory = workspace) => {
      const { stdout } = await run(
        process.execPath,
        [join(scripts, 'kitchen-bridge.mjs'), action, '--workspace', directory],
        { timeout: 10000 },
      );
      assert.doesNotMatch(stdout, /"token"/);
      return JSON.parse(stdout) as {
        workspaceId: string;
        origin: string;
        stopped?: boolean;
      };
    };
    const waitForStop = async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          await agentRequest(workspace, '/bridge/agent-status');
        } catch {
          return;
        }
        await new Promise((ok) => setTimeout(ok, 50));
      }
      throw new Error('Test child did not stop');
    };
    t.after(async () => {
      try {
        await cli('stop');
      } catch {
        /* already stopped */
      }
      await waitForStop();
      await rm(base, { recursive: true, force: true });
    });
    const first = await cli('start');
    assert.equal((await fetch(first.origin)).status, 200);
    assert.equal((await cli('start')).workspaceId, first.workspaceId);
    await assert.rejects(cli('start', other));
    assert.equal((await cli('status')).workspaceId, first.workspaceId);
    assert.equal((await cli('stop')).stopped, true);
    await waitForStop();
    assert.equal((await cli('start')).workspaceId, first.workspaceId);
  },
);

void test('Windows and macOS speech use their own venv layout with Chinese and spaced paths', () => {
  assert.equal(
    voicePython('C:\\评委 厨房 & !\\.kitchen-voice', 'win32'),
    'C:\\评委 厨房 & !\\.kitchen-voice\\venv\\Scripts\\python.exe',
  );
  assert.equal(
    voicePython('/评委 厨房/.kitchen-voice', 'darwin'),
    '/评委 厨房/.kitchen-voice/venv/bin/python',
  );
  assert.equal(
    voicePython('/厨房/.kitchen-voice', 'linux'),
    '/厨房/.kitchen-voice/venv/bin/python',
  );
});

void test('speech subprocesses force UTF-8 without discarding PATH; setup caches stay in package runtime', () => {
  const env = voiceEnvironment('/judge', {
    PATH: '/tools',
    PYTHONIOENCODING: 'gbk',
  });
  assert.equal(env.PATH, '/tools');
  assert.equal(env.PYTHONUTF8, '1');
  assert.equal(env.PYTHONIOENCODING, 'utf-8');
  assert.equal(env.UV_CACHE_DIR, join('/judge', '.kitchen-voice', 'uv-cache'));
  assert.equal(
    env.UV_PYTHON_INSTALL_DIR,
    join('/judge', '.kitchen-voice', 'python'),
  );
});

void test('Node minimum is checked for new machines', () => {
  for (const version of ['18.20.0', '20.18.0', '22.12.0', 'garbage'])
    assert.throws(() => requireNode(version), /22.13/);
  for (const version of ['22.13.0', '22.14.0', '24.0.0']) requireNode(version);
});

void test('release manifest contains both platforms, all relative module dependencies and no private paths', async () => {
  assert.equal(new Set(releasePaths).size, releasePaths.length);
  for (const path of [
    'Start-Windows.cmd',
    'Setup-Voice-Windows.cmd',
    'Stop-Windows.cmd',
    '停止厨房.command',
    'CHINESE-RECIPE-SOURCES.md',
  ])
    assert.ok(releasePaths.includes(path), path);
  assert.ok(
    releaseFiles.some(
      ([source, dest]) =>
        source === 'docs/JUDGE-GUIDE.md' && dest === 'README.md',
    ),
  );
  for (const path of releasePaths)
    assert.doesNotMatch(
      path,
      /(^|\/)(\.env|\.kitchen-|node_modules|\.git|\.DS_Store)|\.zip$|\.pem$/,
    );
  for (const [source, dest] of releaseFiles) {
    const content = await readFile(resolve(root, source), 'utf8');
    if (dest.endsWith('.mjs')) {
      for (const match of content.matchAll(
        /(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g,
      )) {
        const target = posix.normalize(
          posix.join(posix.dirname(dest), match[1]),
        );
        assert.ok(releasePaths.includes(target), dest + ' needs ' + target);
      }
    }
    if (dest.endsWith('.cmd')) {
      assert.match(content, /setlocal DisableDelayedExpansion/);
      assert.match(content, /"%~dp0\."/);
      assert.match(content, /if errorlevel 1 goto failed/);
      assert.doesNotMatch(content, /ExecutionPolicy|taskkill|powershell|bash/i);
      assert.ok(Buffer.from(content).every((byte) => byte < 128));
    }
  }
});

void test('launcher fails clearly for an incomplete ZIP, without creating private runtime', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), '评委 厨房 & ! '));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const script = resolve(root, 'skills/zhonghua-shisi/scripts/workbench.mjs');
  await assert.rejects(
    run(process.execPath, [script, 'start', workspace]),
    (error: unknown) => {
      const failure = error as Error & { code: number; stderr: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stderr, /完整解压 ZIP/);
      return true;
    },
  );
});

void test('PowerShell UTF-8 BOM result is accepted through actual CLI and non-ASCII path', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), '评委 厨房 & ! '));
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<html><head></head><body>test fixture</body></html>',
  );
  const server = await startBridge({ workspace, port: 0 });
  t.after(async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  });
  const client = randomUUID();
  const { ticket } = await new WorkBuddyBridge(client, server.origin).begin(
    'real',
    'stocktake',
  );
  const file = join(workspace, '.kitchen-bridge', '提取结果.json');
  await writeFile(
    file,
    '\uFEFF' +
      JSON.stringify({
        schemaVersion: '1.0',
        source: 'workbuddy-image',
        warnings: [],
        candidates: [
          {
            candidateId: 'egg',
            displayName: '鸡蛋',
            amount: 2,
            unit: '个',
            warnings: [],
          },
        ],
      }),
  );
  const { stdout } = await run(process.execPath, [
    resolve(root, 'skills/zhonghua-shisi/scripts/kitchen-bridge.mjs'),
    'submit',
    '--workspace',
    workspace,
    '--ticket',
    ticket.id,
    '--file',
    file,
  ]);
  assert.equal(JSON.parse(stdout).status, 'pending');
  const received = (await (
    await fetch(server.origin + '/bridge/next', {
      headers: { 'X-Kitchen-Client': client },
    })
  ).json()) as { entry: Delivery };
  assert.ok(Array.isArray(received.entry.envelope.candidates));
  assert.equal(received.entry.envelope.candidates[0].displayName, '鸡蛋');
});

void test('stop aborts an active speech request and close remains idempotent', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), '厨房 stop '));
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<html><head></head><body>fixture</body></html>',
  );
  let started!: () => void;
  const active = new Promise<void>((ok) => {
    started = ok;
  });
  let cancelled = false;
  const server = await startBridge({
    workspace,
    port: 0,
    speech: {
      status: async () => ({ ready: true }),
      transcribe: async (req: IncomingMessage, signal: AbortSignal) => {
        for await (const _chunk of req) {
          /* consume test fixture */
        }
        started();
        return new Promise((_ok, no) =>
          signal.addEventListener(
            'abort',
            () => {
              cancelled = true;
              no(Object.assign(new Error('已取消识别。'), { status: 499 }));
            },
            { once: true },
          ),
        );
      },
    },
  });
  t.after(async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  });
  const request = fetch(server.origin + '/voice/transcribe', {
    method: 'POST',
    headers: { 'X-Kitchen-Client': randomUUID(), 'Content-Type': 'audio/wav' },
    body: new Uint8Array(40),
    signal: AbortSignal.timeout(5000),
  });
  await active;
  assert.equal(
    (await agentRequest(workspace, '/bridge/stop', {})).stopped,
    true,
  );
  assert.equal((await request).status, 499);
  assert.equal(cancelled, true);
  await server.close();
});
