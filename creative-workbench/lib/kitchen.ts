import { names, recipes, RECIPE_VERSION, type Recipe } from './recipes';
import { isSeasoning, PRESENT_QUANTITY, seasoningNames } from './seasonings';
export type Dataset = 'real' | 'demo';
export type Mode = 'stocktake' | 'restock';
export const units = ['个', '盒', '袋', '克', '毫升', '份'] as const;
export const bands = [
  PRESENT_QUANTITY,
  '充足',
  '少量',
  '即将用完',
  '用完',
] as const;
export type Quantity = { amount?: number; unit?: string; amountBand?: string };
export type Candidate = Quantity & {
  key: string;
  candidateId: string;
  requestId: string;
  displayName: string;
  canonicalIngredientId?: string;
  rawMention?: string;
  warnings: string[];
  mode: Mode;
  source: string;
  status: 'pending' | 'confirmed' | 'rejected';
  // Local inventory-card edits retain their exact target; never taken from imports.
  stocktakeTarget?: { id: string; revision: number };
};
export type Batch = Quantity & {
  id: string;
  displayName: string;
  canonicalIngredientId: string;
  revision: number;
  expiryDate?: string;
  confirmed: true;
  createdAt: string;
  updatedAt: string;
};
export type Review = { by: string; at: string; version: string };
export type Consumption = {
  batchId: string;
  expectedRevision: number;
  remaining: Quantity;
};
export type Session = {
  id: string;
  recipeId: string;
  recipeVersion: string;
  servings: number;
  status: 'cooking' | 'paused' | 'reviewing' | 'completed';
  step: number;
  createdAt: string;
  completedAt?: string;
  timerEnd?: number;
  timerRemaining?: number;
  userRating?: number;
  familyMemory?: string;
  photo?: string;
  actualConsumption?: Consumption[];
  reviewDraft?: {
    rating: number;
    memory: string;
    photo?: string;
    consumption: Consumption[];
  };
  inventorySnapshot: Batch[];
};
export type Preferences = {
  servings: number;
  minutes: number;
  allergens: string[];
  equipment: string[];
  dislikedIngredients: string[];
};
export type KitchenState = {
  dataset: Dataset;
  revision: number;
  inventory: Batch[];
  candidates: Candidate[];
  sessions: Session[];
  reviews: Record<string, Review>;
  preferences: Preferences;
  bridgeIgnoredTicketIds?: string[];
  seasoningSetup?: {
    version: 1;
    completedAt: string;
    skipped: boolean;
    receipts: string[];
  } | null;
};
export const uid = () => globalThis.crypto.randomUUID();
export const DEFAULT_SERVINGS = 1;
export const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};
export function emptyState(dataset: Dataset): KitchenState {
  return {
    dataset,
    revision: 0,
    inventory: [],
    candidates: [],
    sessions: [],
    reviews: {},
    seasoningSetup: null,
    preferences: {
      servings: DEFAULT_SERVINGS,
      minutes: 20,
      allergens: [],
      equipment: [...new Set(recipes.map((r) => r.equipment))],
      dislikedIngredients: [],
    },
  };
}
function fail(message: string): never {
  throw new Error(message);
}
function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x))
    fail('请输入 JSON 对象，而不是列表或普通文字。');
  return x as Record<string, unknown>;
}
function short(x: unknown, label: string, max = 160): string {
  if (typeof x !== 'string' || !x.trim() || x.length > max)
    fail(label + ' 不能为空或过长。');
  return x.trim();
}
function warnings(x: unknown): string[] {
  if (x === undefined) return [];
  if (
    !Array.isArray(x) ||
    x.length > 30 ||
    x.some((v) => typeof v !== 'string' || v.length > 300)
  )
    fail('warnings 应为简短文字列表。');
  return x as string[];
}
export function validateQuantity(q: Quantity): Quantity {
  if (q.amount !== undefined) {
    if (
      typeof q.amount !== 'number' ||
      !Number.isFinite(q.amount) ||
      q.amount < 0 ||
      q.amount > 1000000 ||
      q.amountBand !== undefined ||
      !units.includes(q.unit as (typeof units)[number])
    )
      fail('请填写非负数量和支持的单位；数量档与精确数量不能同时使用。');
    return { amount: q.amount, unit: q.unit };
  }
  if (!bands.includes(q.amountBand as (typeof bands)[number]))
    fail('数量不确定时，请选择数量档。');
  if (q.unit !== undefined && !units.includes(q.unit as (typeof units)[number]))
    fail('不支持这个单位，请人工确认。');
  return { amountBand: q.amountBand, ...(q.unit ? { unit: q.unit } : {}) };
}
export function quantityText(q: Quantity): string {
  return q.amount !== undefined
    ? q.amount + ' ' + (q.unit || '')
    : q.amountBand || '数量待确认';
}
export function isExpired(b: Batch, date = today()): boolean {
  return !!b.expiryDate && b.expiryDate < date;
}
export function validateDate(d?: string) {
  if (
    d &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) !== d)
  )
    fail('请输入有效的到期日期。');
}
const aliases: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(seasoningNames).map(([id, name]) => [name, id]),
  ),
  糖: 'sugar',
  番茄: 'tomato',
  西红柿: 'tomato',
  鸡蛋: 'egg',
  青椒: 'green_pepper',
  食用油: 'oil',
  油: 'oil',
  盐: 'salt',
  生抽: 'soy_sauce',
  饮用水: 'water',
  水: 'water',
  大米: 'rice',
  生大米: 'rice',
  米饭: 'cooked_rice',
  剩饭: 'cooked_rice',
  熟米饭: 'cooked_rice',
  豆腐: 'tofu',
  土豆: 'potato',
};
/** Transport metadata is bound by the user's visible current dataset and import mode. */
export function parseImport(
  raw: string,
  dataset: Dataset,
  mode: Mode,
): Candidate[] {
  if (raw.length > 200000) fail('导入内容过大，请分批导入（最多 200 KB）。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('JSON 格式有误，原文已保留。可修改后重试，或用手动表单。');
  }
  const data = object(parsed);
  if (data.schemaVersion !== '1.0') fail('仅支持 schemaVersion 1.0。');
  const requestId = short(data.requestId, 'requestId');
  if (data.dataset !== undefined && data.dataset !== dataset)
    fail('文件所属厨房与当前厨房不同。请切换厨房，不会自动迁移数据。');
  if (data.mode !== undefined && data.mode !== mode)
    fail('文件操作与当前盘点 / 补货选择不一致，请确认后再导入。');
  if (
    typeof data.source !== 'string' ||
    ![
      'workbuddy-image',
      'workbuddy-voice-transcript',
      'browser-speech-transcript',
      'gateway-image',
      'gateway-text',
      'manual-text',
      'manual-form',
      'demo',
    ].includes(data.source)
  )
    fail('输入 source 无效。');
  if (data.source === 'demo' && dataset !== 'demo')
    fail('样例不能进入真实厨房。');
  if (
    typeof data.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(data.createdAt))
  )
    fail('createdAt 日期无效。');
  if (
    data.transcript !== undefined &&
    (typeof data.transcript !== 'string' || data.transcript.length > 10000)
  )
    fail('transcript 必须是简短的原始转写文字。');
  const common = warnings(data.warnings);
  if (
    !Array.isArray(data.candidates) ||
    !data.candidates.length ||
    data.candidates.length > 50
  )
    fail('每次导入需要 1–50 个候选。');
  const seen = new Set<string>();
  return data.candidates.map((v) => {
    const c = object(v),
      candidateId = short(c.candidateId, 'candidateId');
    if (seen.has(candidateId)) fail('同一文件的 candidateId 不能重复。');
    seen.add(candidateId);
    const displayName = short(c.displayName, '食材名称', 60),
      notes = [...common, ...warnings(c.warnings)];
    const rawMention =
      c.rawMention === undefined
        ? undefined
        : short(c.rawMention, 'rawMention', 500);
    if (
      rawMention &&
      typeof data.transcript === 'string' &&
      !data.transcript.includes(rawMention)
    )
      fail(
        '原始提及「' + rawMention + '」不在转写原文中，请核对，不要改写原话。',
      );
    if (
      c.confidence !== undefined &&
      (typeof c.confidence !== 'number' ||
        !Number.isFinite(c.confidence) ||
        c.confidence < 0 ||
        c.confidence > 1)
    )
      fail('confidence 必须在 0–1 之间。');
    let q: Quantity = {};
    if (c.unit !== undefined && typeof c.unit !== 'string')
      fail('unit 必须是文字单位。');
    if (
      c.unit !== undefined &&
      !units.includes(c.unit as (typeof units)[number])
    ) {
      notes.push(
        '原单位「' +
          String(c.unit).slice(0, 30) +
          '」不支持，请手动确认数量；未自动换算。',
      );
    } else if (c.amount !== undefined || c.amountBand !== undefined) {
      q = validateQuantity({
        amount: c.amount as number,
        unit: c.unit as string,
        amountBand: c.amountBand as string,
      });
    } else notes.push('原输入没有明确数量，等待人工确认。');
    if (c.confirmed !== undefined)
      notes.push('文件中的确认标记已忽略，需要你在这里确认。');
    const canonicalIngredientId =
      typeof c.canonicalIngredientId === 'string' &&
      names[c.canonicalIngredientId]
        ? c.canonicalIngredientId
        : aliases[displayName] || 'other';
    if (canonicalIngredientId === 'other')
      notes.push('暂未匹配内置菜谱，将按原名称记录。');
    return {
      ...q,
      key: JSON.stringify([requestId, candidateId]),
      candidateId,
      requestId,
      displayName,
      canonicalIngredientId,
      rawMention,
      warnings: notes,
      mode,
      source: String(data.source),
      status: 'pending',
    };
  });
}
export function stage(s: KitchenState, items: Candidate[]): void {
  for (const c of items) {
    if (!s.candidates.some((x) => x.key === c.key)) s.candidates.push(c);
  }
}
export function confirmCandidate(
  s: KitchenState,
  key: string,
  input: {
    name: string;
    ingredientId: string;
    quantity: Quantity;
    expiryDate?: string;
    targetId?: string;
    targetRevision?: number;
  },
  at = new Date().toISOString(),
): void {
  const c = s.candidates.find((x) => x.key === key);
  if (!c) fail('候选不存在，请重新载入。');
  if (c.status !== 'pending') return;
  const quantity = validateQuantity(input.quantity);
  if (!names[input.ingredientId]) fail('请选择有效食材。');
  const name = short(input.name, '食材名称', 60);
  validateDate(input.expiryDate);
  const target = input.targetId
    ? s.inventory.find((x) => x.id === input.targetId)
    : undefined;
  if (input.targetId && !target) fail('原批次已不存在，请重新确认。');
  if (target) {
    if (target.revision !== input.targetRevision)
      fail('库存已变化，请重新核对批次。');
    if (target.canonicalIngredientId !== input.ingredientId)
      fail('不能把不同食材合并到同一批次。');
    if (c.mode === 'restock') {
      if (
        target.unit !== quantity.unit ||
        target.amount === undefined ||
        quantity.amount === undefined
      )
        fail('补货合并需要相同的精确单位，否则请新建批次。');
      if ((target.expiryDate || '') !== (input.expiryDate || ''))
        fail('到期日期不同，请新建批次。');
      quantity.amount += target.amount;
      validateQuantity(quantity);
    }
    delete target.amount;
    delete target.unit;
    delete target.amountBand;
    Object.assign(target, quantity, {
      displayName: name,
      expiryDate: input.expiryDate,
      revision: target.revision + 1,
      updatedAt: at,
    });
  } else
    s.inventory.push({
      ...quantity,
      id: uid(),
      displayName: name,
      canonicalIngredientId: input.ingredientId,
      revision: 1,
      expiryDate: input.expiryDate,
      confirmed: true,
      createdAt: at,
      updatedAt: at,
    });
  c.status = 'confirmed';
}
export function rejectCandidate(s: KitchenState, key: string) {
  const c = s.candidates.find((x) => x.key === key);
  if (c?.status === 'pending') c.status = 'rejected';
}
export function activeSession(s: KitchenState) {
  return s.sessions.find((x) => x.status !== 'completed');
}
export function matching(
  s: KitchenState,
  r: Recipe,
  date = today(),
  servings = DEFAULT_SERVINGS,
) {
  return r.ingredients.map((i) => {
    const eligible = s.inventory.filter(
      (b) => b.canonicalIngredientId === i.id && !isExpired(b, date),
    );
    const amount = eligible
      .filter((b) => b.unit === i.unit)
      .reduce((n, b) => n + (b.amount || 0), 0);
    return {
      ...i,
      need: i.amount * servings,
      have: amount,
      enough: amount >= i.amount * servings,
      unknown: eligible.some(
        (b) => b.amount === undefined || b.unit !== i.unit,
      ),
      // Presence helps discovery, but never proves that the required grams/ml are available.
      presenceOnly:
        isSeasoning(i.id) &&
        eligible.some((b) => b.amountBand === PRESENT_QUANTITY),
    };
  });
}
export function recommendations(s: KitchenState, date = today()) {
  return recipes
    .map((r) => {
      const matches = matching(s, r, date),
        missing = matches.filter((i) => !i.enough);
      const urgent =
        matches.filter((i) =>
          s.inventory.some(
            (b) =>
              b.canonicalIngredientId === i.id &&
              !isExpired(b, date) &&
              b.expiryDate &&
              Date.parse(b.expiryDate + 'T12:00:00Z') -
                Date.parse(date + 'T12:00:00Z') <=
                2 * 86400000,
          ),
        ).length / matches.length;
      const score =
        (0.7 * (matches.length - missing.length)) / matches.length +
        0.3 * urgent;
      return { recipe: r, matches, missing, score };
    })
    .filter((x) => x.missing.filter((i) => !i.presenceOnly).length < 2)
    .sort(
      (a, b) =>
        b.score - a.score || a.recipe.id.localeCompare(b.recipe.id, 'en'),
    )
    .slice(0, 3);
}
export function reviewed(s: KitchenState, r: Recipe) {
  return s.reviews[r.id]?.version === RECIPE_VERSION;
}
export function reviewRecipe(s: KitchenState, recipeId: string, by: string) {
  if (!recipes.some((r) => r.id === recipeId)) fail('菜谱不存在。');
  s.reviews[recipeId] = {
    by: short(by, '审校人', 50),
    at: new Date().toISOString(),
    version: RECIPE_VERSION,
  };
}
export function startCooking(
  s: KitchenState,
  recipeId: string,
  id = uid(),
  date = today(),
) {
  if (s.sessions.some((x) => x.id === id)) return;
  if (activeSession(s)) fail('还有一餐未完成，请先继续当前一餐。');
  const r = recipes.find((x) => x.id === recipeId);
  if (!r) fail('菜谱不存在。');
  if (s.dataset === 'real' && !reviewed(s, r))
    fail('现实跟做前，先逐项完成人工菜谱审校；样例厨房可演练。');
  if (
    !recommendations(s, date).some(
      (x) => x.recipe.id === recipeId && !x.missing.length,
    )
  )
    fail('食材库存已改变，请返回推荐重新核对。');
  s.sessions.unshift({
    id,
    recipeId,
    recipeVersion: RECIPE_VERSION,
    servings: DEFAULT_SERVINGS,
    status: 'cooking',
    step: 0,
    createdAt: new Date().toISOString(),
    inventorySnapshot: structuredClone(s.inventory),
  });
}
export function stepSession(s: KitchenState, id: string, step: number) {
  const session = s.sessions.find((x) => x.id === id);
  if (!session || session.status === 'completed') fail('这餐已结束或不存在。');
  const r = recipes.find((x) => x.id === session.recipeId)!;
  if (!Number.isInteger(step) || step < 0 || step > r.steps.length)
    fail('无效步骤。');
  session.step = step;
  session.status = step === r.steps.length ? 'reviewing' : 'cooking';
  delete session.timerEnd;
  delete session.timerRemaining;
}
export function remainingPlan(
  s: KitchenState,
  r: Recipe,
  servings: number,
  date = today(),
): Consumption[] {
  const result: Consumption[] = [];
  for (const ingredient of r.ingredients) {
    let need = ingredient.amount * servings;
    const candidates = s.inventory
      .filter(
        (b) => b.canonicalIngredientId === ingredient.id && !isExpired(b, date),
      )
      .sort(
        (a, b) =>
          (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') ||
          a.id.localeCompare(b.id),
      );
    for (const b of candidates) {
      if (need <= 0) break;
      if (b.amount === undefined || b.unit !== ingredient.unit) continue;
      const consumed = Math.min(need, b.amount);
      if (!consumed) continue;
      need -= consumed;
      result.push({
        batchId: b.id,
        expectedRevision: b.revision,
        remaining: {
          amount: Math.round((b.amount - consumed) * 1000) / 1000,
          unit: b.unit,
        },
      });
    }
  }
  return result;
}
export function completeCooking(
  s: KitchenState,
  id: string,
  review: {
    rating: number;
    memory: string;
    photo?: string;
    consumption: Consumption[];
  },
  at = new Date().toISOString(),
) {
  const session = s.sessions.find((x) => x.id === id);
  if (!session) fail('烹饪记录不存在。');
  if (session.status === 'completed') return;
  if (session.status !== 'reviewing') fail('请先完成跟做，再确认实际消耗。');
  if (
    !Number.isInteger(review.rating) ||
    review.rating < 1 ||
    review.rating > 5
  )
    fail('请给这一餐打 1–5 分。');
  if (review.memory.length > 2000) fail('家庭记忆请控制在 2000 字以内。');
  if (
    review.photo &&
    (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
      review.photo,
    ) ||
      review.photo.length > 2500000)
  )
    fail('照片格式不支持或过大。');
  const seen = new Set<string>(),
    updates: { batch: Batch; q: Quantity }[] = [];
  for (const use of review.consumption) {
    if (seen.has(use.batchId)) fail('同一批次不能重复扣减。');
    seen.add(use.batchId);
    const batch = s.inventory.find((x) => x.id === use.batchId);
    if (!batch || batch.revision !== use.expectedRevision)
      fail('库存在核对期间已变化，请重新核对实际剩余量。');
    const q = validateQuantity(use.remaining);
    if (
      batch.amount !== undefined &&
      q.amount !== undefined &&
      (q.unit !== batch.unit || q.amount > batch.amount)
    )
      fail('剩余量不能大于原量或静默换单位；补货请到我的厨房操作。');
    if (batch.amount !== undefined && q.amount === undefined)
      fail('精确数量批次请填写实际剩余数量。');
    updates.push({ batch, q });
  }
  for (const { batch, q } of updates) {
    delete batch.amount;
    delete batch.unit;
    delete batch.amountBand;
    Object.assign(batch, q, { revision: batch.revision + 1, updatedAt: at });
  }
  Object.assign(session, {
    status: 'completed',
    completedAt: at,
    userRating: review.rating,
    familyMemory: review.memory,
    photo: review.photo,
    actualConsumption: review.consumption,
  });
  delete session.timerEnd;
  delete session.timerRemaining;
  delete session.reviewDraft;
}
export function archive(s: KitchenState) {
  return recipes
    .map((recipe) => ({
      recipe,
      history: s.sessions.filter(
        (x) => x.recipeId === recipe.id && x.status === 'completed',
      ),
    }))
    .filter((e) => e.history.length);
}
export function demoImport(dataset: Dataset = 'demo') {
  if (dataset !== 'demo') fail('演练食材只能载入样例厨房。');
  return JSON.stringify({
    schemaVersion: '1.0',
    requestId: 'golden-kitchen-v1',
    dataset: 'demo',
    mode: 'stocktake',
    source: 'demo',
    createdAt: '2026-09-05T12:00:00+08:00',
    warnings: ['体验样例，不代表你真实拥有这些食材。'],
    candidates: [
      ['tomato', 800, '克'],
      ['egg', 8, '个'],
      ['green_pepper', 250, '克'],
      ['oil', 150, '毫升'],
      ['salt', 50, '克'],
      ['soy_sauce', 100, '毫升'],
      ['water', 3000, '毫升'],
    ].map(([id, amount, unit], i) => ({
      candidateId: 'demo-' + i,
      canonicalIngredientId: id,
      displayName: names[id as string],
      amount,
      unit,
      warnings: [],
    })),
  });
}
