import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source-level UX guard: not a claim of browser or microphone acceptance.
const page = () =>
  readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

void test('kitchen has no user-facing candidate JSON import path', async () => {
  const source = await page();
  assert.equal(
    /setDialog\('import'\)|dialog === 'import'/.test(source),
    false,
    'remove the import dialog route',
  );
  assert.equal(
    /导入 JSON|粘贴 JSON|选择 JSON 文件|手动导入已有结果/.test(source),
    false,
    'remove technical import controls',
  );
  assert.equal(
    /FileJson|setRaw|json-text/.test(source),
    false,
    'remove dead import state and form',
  );
});

void test('removing technical import preserves manual input, WorkBuddy receipt and backup', async () => {
  const source = await page();
  assert.match(source, /setDialog\('manual'\)/);
  assert.match(source, /setDialog\('workbuddy'\)/);
  assert.match(source, /stageDelivery\(/);
  assert.match(source, /zhonghua-shisi-backup/);
});

void test('webpage voice entry mounts the recording and confirmation component', async () => {
  const source = await page();
  assert.equal(
    source.includes('拍照 / 听写录入食材'),
    false,
    'do not claim a webpage dictation entry exists',
  );
  assert.equal(source.includes('网页麦克风录入尚未接通'), false);
  assert.equal(source.includes("setDialog('voice')"), true);
  assert.equal(source.includes('<VoiceIntake'), true);
  const voice = await readFile(
    new URL('../components/voice-intake.tsx', import.meta.url),
    'utf8',
  );
  assert.equal(
    voice.includes('location.origin !== BRIDGE_URL'),
    false,
    'URL slash must not disable the real local origin',
  );
});
