import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);

void test('cooking mode omits both explanatory sentences without an empty subtitle', () => {
  assert.doesNotMatch(source, /一步一步来，做完以后再核对冰箱/);
  assert.doesNotMatch(
    source,
    /食材与步骤用量按本次人数调整；实际加热时间会受锅具和份量影响，请自行确认熟度/,
  );
  assert.match(source, /page !== 'cooking' && \(\s*<p>/);
  assert.match(source, /冰箱有啥，今天吃啥。挑一道手边就能做的家常菜。/);
  assert.match(source, /先确认，再入库。每一批食材，都由你说了算。/);
  assert.match(source, /在游戏里收集味道，在生活里留住食忆。/);
  assert.match(source, /查看食材与来源/);
});
