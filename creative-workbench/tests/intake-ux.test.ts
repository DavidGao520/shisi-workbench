import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source-level UX guard: not a claim of browser or microphone acceptance.
const page = () =>
  readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

void test('photo actions use plain names and manual input has matching button styling', async () => {
  const source = await page();
  assert.match(source, /拍照录入食材/);
  assert.match(source, /拍照识别/);
  assert.doesNotMatch(
    source,
    /继续用 WorkBuddy 录入食材|用 WorkBuddy 拍照录入食材|用 WorkBuddy 录入食材/,
  );
  const tools = source
    .split('<div className="inventory-tools">')[1]
    .split('zhonghua-shisi-backup')[0];
  assert.match(
    tools,
    /className="secondary"\s+onClick=\{\(\) => setDialog\('manual'\)/,
  );
  assert.match(tools, /className="text-button"[^<]*[\s\S]*?调料清单/);
  assert.ok(tools.indexOf('拍照识别') < tools.indexOf('手动补充'));
  assert.ok(tools.indexOf('手动补充') < tools.indexOf('调料清单'));
});

void test('meal setup and browser-storage paragraph are removed, recipe safety notes stay', async () => {
  const source = await page();
  assert.doesNotMatch(
    source,
    /今天这一餐|几个人吃|最多花多久|需要避开|preference-fields/,
  );
  assert.doesNotMatch(
    source,
    /保存在当前浏览器环境|清理浏览器数据可能丢失记录|s\.preferences/,
  );
  assert.match(source, /safetyNote/);
  assert.match(source, /DEFAULT_SERVINGS/);
});

void test('candidate and voice review show quantities and expiry without identity or target pickers', async () => {
  const source = await page();
  const candidate = source
    .split('function CandidateEditor(')[1]
    .split('function ReviewForm(')[0];
  assert.doesNotMatch(
    candidate,
    /label="对应食材"|显示名称|校准哪一批|添加到哪里/,
  );
  assert.match(candidate, /数量形式/);
  assert.match(candidate, /到期日期/);
  assert.match(source, /stageInventoryEditCandidate\(state, b\.id\)/);
  const voice = await readFile(
    new URL('../components/voice-intake.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(voice, /对应食材|食材名称|要校准的库存|库存批次/);
  assert.match(voice, /数量形式/);
  assert.match(voice, /到期日期/);
  assert.match(voice, /库存卡片分别校准余量/);
});

void test('confirmed inventory cards open calibration from the whole card', async () => {
  const card = await readFile(
    new URL('../components/kitchen-ingredient-card.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    card,
    /status === 'pending' && \([\s\S]*?kitchen-ingredient-card__state/,
  );
  assert.doesNotMatch(card, /batchId|批次/);
  assert.doesNotMatch(card, /__action|__footer/);
  assert.match(card, /status === 'confirmed' && triggerLabel && onTrigger/);
  assert.match(
    card,
    /className="kitchen-ingredient-card__trigger"[\s\S]*?aria-label=\{`\$\{accessibleLabel\}。\$\{triggerLabel\}`\}[\s\S]*?disabled=\{triggerDisabled\}[\s\S]*?onClick=\{onTrigger\}/,
  );
  const source = await page();
  const candidateEditor = source
    .split('function CandidateEditor(')[1]
    .split('function ReviewForm(')[0];
  const pendingPreview = candidateEditor
    .split('<KitchenIngredientCard')[1]
    .split('/>')[0];
  assert.doesNotMatch(pendingPreview, /triggerLabel|triggerDisabled|onTrigger/);
  const illustratedInventory = source
    .split('pantryCardArt[b.canonicalIngredientId] ? (')[1]
    .split(') : (')[0];
  assert.doesNotMatch(illustratedInventory, /batchId/);
  assert.doesNotMatch(illustratedInventory, /actionLabel|校准余量/);
  assert.match(illustratedInventory, /triggerDisabled=\{busy\}/);
  assert.match(
    illustratedInventory,
    /onTrigger=\{\(\) => void calibrateBatch\(b\)\}/,
  );
  assert.doesNotMatch(source, /批次 \{b\.id\.slice\(0, 6\)\}/);
  assert.doesNotMatch(source, /inventory-item__actions/);
  assert.match(
    source,
    /className="inventory-item__trigger"[\s\S]*?disabled=\{busy\}[\s\S]*?onClick=\{\(\) => void calibrateBatch\(b\)\}/,
  );
  const calibration = source
    .split('const calibrateBatch = async')[1]
    .split('const changeDataset')[0];
  assert.match(calibration, /stageInventoryEditCandidate\(state, b\.id\)/);
  assert.match(source, /open=\{!!calibrationCandidate\}/);
  assert.match(source, /variant="calibration"/);
  assert.match(source, /核对数量形式、数量和到期日期/);
});

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
