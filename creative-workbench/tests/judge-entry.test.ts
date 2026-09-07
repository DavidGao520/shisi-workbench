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
function evaluate(code: string, context: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
}

void test('only the standalone judge entry defaults to demo; page state and bridge target agree', () => {
  const home = nodes.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'Home',
  ) as ts.FunctionDeclaration;
  const props = evaluate(
    `(${home.parameters.map((p) => p.getText(file)).join(',')}) => initialDataset`,
    {},
  );
  assert.equal(props({}), 'real');
  assert.equal(props({ initialDataset: 'demo' }), 'demo');
  for (const initialDataset of ['real', 'demo']) {
    const values: unknown[] = [];
    for (const name of ['[dataset, setDataset]', 'datasetRef']) {
      const declaration = nodes.find(
        (node) =>
          ts.isVariableDeclaration(node) && node.name.getText(file) === name,
      ) as ts.VariableDeclaration;
      assert.ok(declaration?.initializer, name);
      values.push(
        evaluate(declaration.initializer.getText(file), {
          initialDataset,
          useState: (value: unknown) => value,
          useRef: (value: unknown) => value,
        }),
      );
    }
    assert.deepEqual(values, [initialDataset, initialDataset]);
  }
  const standalone = readFileSync(
    new URL('../standalone/main.tsx', import.meta.url),
    'utf8',
  );
  assert.match(standalone, /<Home\s+initialDataset="demo"\s*\/>/);
  assert.match(
    source,
    /changeDataset\(dataset === 'real' \? 'demo' : 'real'\)/,
  );
});

function boot(dataset = 'demo') {
  const effect = nodes.find(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'useEffect' &&
      node.arguments[0]?.getText(file).includes('openDemoKitchen(db)'),
  ) as ts.CallExpression;
  assert.ok(effect);
  let resolve!: (value: unknown) => void;
  const pending = new Promise((yes) => {
    resolve = yes;
  });
  const observed = {
    page: 'today',
    state: undefined as unknown,
    realReads: 0,
    demoReads: 0,
  };
  const initialViewPending = { current: true };
  const datasetRef = { current: dataset };
  const cleanup = evaluate(`(${effect.arguments[0].getText(file)})`, {
    dataset,
    datasetRef,
    initialViewPending,
    db: {
      read: () => {
        observed.realReads++;
        return pending;
      },
    },
    openDemoKitchen: () => {
      observed.demoReads++;
      return pending;
    },
    tourPages: ['today', 'inventory', 'today', 'cooking', 'archive'],
    setState: (update: (previous: unknown) => unknown) => {
      observed.state = update(observed.state);
    },
    setPage: (value: string) => {
      observed.page = value;
    },
    setError: (reason: string) => {
      throw new Error(reason);
    },
  })();
  return {
    observed,
    initialViewPending,
    datasetRef,
    cleanup,
    async finish(step: number | null) {
      resolve({ dataset, revision: 1, demoExperience: { tourStep: step } });
      await pending;
    },
  };
}

void test('judge initial hydration resumes every saved tour stop and completed tours open today', async () => {
  for (const [step, page] of [
    [0, 'today'],
    [1, 'inventory'],
    [2, 'today'],
    [3, 'cooking'],
    [4, 'archive'],
    [null, 'today'],
  ] as const) {
    const current = boot();
    await current.finish(step);
    assert.equal(current.observed.page, page);
    assert.equal(current.observed.demoReads, 1);
    assert.equal(current.observed.realReads, 0);
    assert.equal(current.initialViewPending.current, false);
  }
});

void test('initial loading never overrides a view the visitor has already chosen', async () => {
  const current = boot();
  current.initialViewPending.current = false;
  current.observed.page = 'inventory';
  await current.finish(3);
  assert.equal(current.observed.page, 'inventory');
});

void test('cancelled or superseded initial hydration cannot expose the old kitchen', async () => {
  for (const superseded of [false, true]) {
    const current = boot();
    if (superseded) current.datasetRef.current = 'real';
    else current.cleanup();
    await current.finish(4);
    assert.equal(current.observed.state, undefined);
    assert.equal(current.observed.page, 'today');
  }
});

void test('hosted page initial hydration stays real and does not initialize sample data', async () => {
  const current = boot('real');
  await current.finish(4);
  assert.equal(current.observed.realReads, 1);
  assert.equal(current.observed.demoReads, 0);
  assert.equal(current.observed.page, 'today');
});
