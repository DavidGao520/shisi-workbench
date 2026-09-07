import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(file);
function handler(tag: string, attribute: string, text?: string) {
  const element = nodes.find(
    (node) =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag &&
      (!text || node.parent.getText(file).includes(text)),
  ) as ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined;
  assert.ok(element, `locate ${tag} ${text || ''}`);
  const attr = element.attributes.properties.find(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === attribute,
  ) as ts.JsxAttribute | undefined;
  assert.ok(
    attr?.initializer &&
      ts.isJsxExpression(attr.initializer) &&
      attr.initializer.expression,
  );
  return attr.initializer.expression.getText(file);
}
function harness(
  initialPage = 'archive',
  initialMessage = '这一餐已收录百味图。',
) {
  const state = {
    page: initialPage,
    message: initialMessage,
    error: 'storage error',
    dialog: null as string | null,
    tourPaused: false,
  };
  const initialViewPending = { current: true };
  const context: Record<string, unknown> = {
    initialViewPending,
    setPage: (page: string) => {
      state.page = page;
    },
    setMessage: (message: string) => {
      state.message = message;
    },
    setDialog: (dialog: string | null) => {
      state.dialog = dialog;
    },
    setTourPaused: (paused: boolean) => {
      state.tourPaused = paused;
    },
    useCallback: (callback: unknown) => callback,
  };
  const evaluate = (code: string) =>
    runInNewContext(
      ts.transpileModule(`(${code})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      context,
    );
  const navigation = nodes.find(
    (node) =>
      ts.isVariableDeclaration(node) && node.name.getText(file) === 'navigate',
  ) as ts.VariableDeclaration | undefined;
  if (navigation?.initializer)
    context.navigate = evaluate(navigation.initializer.getText(file));
  return { state, evaluate, initialViewPending };
}

void test('switching any tab dismisses the old success notice and returning does not resurrect it', () => {
  for (const destination of ['today', 'inventory', 'cooking', 'archive']) {
    const { state, evaluate, initialViewPending } = harness(
      destination === 'archive' ? 'inventory' : 'archive',
    );
    const changeTab = evaluate(handler('Tabs', 'onValueChange'));
    changeTab(destination);
    assert.equal(state.page, destination);
    assert.equal(
      initialViewPending.current,
      false,
      'initial hydration must not override manual navigation',
    );
    assert.equal(
      state.tourPaused,
      true,
      'manual navigation lets the visitor explore freely',
    );
    assert.equal(state.message, '', `stale notice on ${destination}`);
    changeTab('archive');
    assert.equal(state.message, '');
    assert.equal(
      state.error,
      'storage error',
      'navigation does not hide persistence errors',
    );
  }
});

void test('in-page navigation buttons also clear stale notices', () => {
  for (const [label, destination] of [
    ['继续这一餐', 'cooking'],
    ['语音录入食材', 'inventory'],
    ['拍照录入食材', 'inventory'],
    ['去我的厨房', 'inventory'],
    ['看看今天吃什么', 'today'],
    ['去选一道菜', 'today'],
  ]) {
    const { state, evaluate } = harness();
    evaluate(handler('button', 'onClick', label))();
    assert.equal(state.page, destination, label);
    assert.equal(state.message, '', label);
  }
});

void test('automatic completion and intake navigation preserve newly created success feedback', () => {
  const completed = harness('cooking');
  completed.evaluate(handler('ReviewForm', 'done'))();
  assert.equal(completed.state.page, 'archive');
  assert.equal(completed.state.message, '这一餐已收录百味图。');
  const voice = harness('today', 'old notice');
  voice.evaluate(handler('VoiceIntake', 'done'))(3);
  assert.equal(voice.state.page, 'inventory');
  assert.equal(voice.state.message, '已确认 3 种食材入库。');
  assert.equal(voice.state.dialog, null);
  assert.match(source, /if \(msg\) setMessage\(msg\)/);
  assert.match(
    source,
    /aria-label="关闭提示"\s+onClick=\{\(\) => setMessage\(''\)\}/,
  );
});

void test('kitchen switch hydrates before exposing its target to bridge deliveries, and failure stays in real', async () => {
  const declaration = nodes.find(
    (node) =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(file) === 'changeDataset',
  ) as ts.VariableDeclaration;
  for (const fail of [false, true]) {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const hydration = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const lock = { current: false };
    const datasetRef = { current: 'real' };
    const observed = { dataset: 'real', page: 'today', busy: false, error: '' };
    const context: Record<string, unknown> = {
      busy: false,
      lock,
      datasetRef,
      initialViewPending: { current: true },
      db: {},
      openDemoKitchen: () => hydration,
      tourPages: ['today', 'inventory', 'today', 'cooking', 'archive'],
      setBusy: (value: boolean) => {
        observed.busy = value;
      },
      setDataset: (value: string) => {
        observed.dataset = value;
      },
      setPage: (value: string) => {
        observed.page = value;
      },
      setError: (value: string) => {
        observed.error = value;
      },
    };
    for (const setter of [
      'setState',
      'setMessage',
      'setDialog',
      'setDetail',
      'setMealConfirmations',
      'setFoodChecked',
      'setSeasoningOpen',
      'setCalibrationKey',
      'setTourPaused',
      'setPreviewStep',
    ])
      context[setter] = () => {};
    const switchKitchen = runInNewContext(
      ts.transpileModule(`(${declaration.initializer!.getText(file)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      context,
    );
    const pending = switchKitchen('demo');
    assert.equal(
      lock.current,
      true,
      'receive/mutate must refuse work during hydration',
    );
    assert.equal(
      datasetRef.current,
      'real',
      'the new bridge target is not visible yet',
    );
    assert.equal(observed.busy, true);
    if (fail) reject(new Error('storage unavailable'));
    else resolve({ dataset: 'demo', demoExperience: { tourStep: 3 } });
    await pending;
    assert.equal(lock.current, false);
    assert.equal(observed.busy, false);
    assert.equal(datasetRef.current, fail ? 'real' : 'demo');
    assert.equal(observed.dataset, fail ? 'real' : 'demo');
    assert.equal(observed.page, fail ? 'today' : 'cooking');
    if (fail) assert.match(observed.error, /厨房未切换/);
  }
});
