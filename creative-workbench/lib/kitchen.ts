import {
  names,
  recipes,
  storedRecipe,
  ingredientAliases,
  inventoryIngredientId,
  RECIPE_VERSION,
  type Recipe,
} from './recipes';
import { isSeasoning, PRESENT_QUANTITY } from './seasonings';
import { validateMealRatings, type MealRatings } from './meal-ratings';
export type Dataset = 'real' | 'demo';
export type Mode = 'stocktake' | 'restock';
export const units = ['个', '盒', '袋', '棵', '克', '毫升', '份'] as const;
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
// A confirmation belongs to one recipe, kitchen and observed ingredient state.
// It is a meal-only draft, never an inventory batch or a candidate import.
export type MealConfirmation = { ingredientId: string; token: string };
export type MealOnlyIngredient = {
  ingredientId: string;
  amount: number;
  unit: string;
};
export type StockAllocation = {
  batchId: string;
  amount: number;
  unit: string;
};
export type Session = {
  id: string;
  sampleRecord?: true;
  /** Imported author testimony, not a recorded in-app cooking session. */
  authoredRecord?: {
    author: string;
    photoCapturedAt?: string;
    addedAt: string;
  };
  recipeId: string;
  recipeVersion: string;
  recipeSnapshot?: Recipe;
  servings: number;
  status: 'cooking' | 'paused' | 'reviewing' | 'completed';
  step: number;
  createdAt: string;
  completedAt?: string;
  timerEnd?: number;
  timerRemaining?: number;
  userRating?: number;
  ratings?: MealRatings;
  familyMemory?: string;
  photo?: string;
  actualConsumption?: Consumption[];
  consumptionMode?: 'recipe-plan';
  mealOnlyIngredients?: MealOnlyIngredient[];
  stockAllocation?: StockAllocation[];
  reviewDraft?: {
    rating?: number; // Legacy single score, never used to prefill three dimensions.
    ratings?: MealRatings;
    memory: string;
    photo?: string;
    consumption?: Consumption[];
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
  demoExperience?: {
    version: 1;
    authoredMealsVersion?: 1;
    referenceDate: string;
    tourStep: number | null;
    recipeId: string;
  };
  bridgeIgnoredTicketIds?: string[];
  workbuddySteps?: Record<
    string,
    {
      ticketId: string;
      baseVersion: string;
      steps: string[];
      warnings: string[];
      createdAt: string;
    }
  >;
  workbuddyReceivedTickets?: string[];
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
/** Hide depleted batches without losing revision history or meal references. */
export function remainingInventory(s: KitchenState): Batch[] {
  return s.inventory.filter((batch) =>
    batch.amount === undefined ? batch.amountBand !== '用完' : batch.amount > 0,
  );
}
export function isExpired(b: Batch, date = today()): boolean {
  return !!b.expiryDate && b.expiryDate < date;
}
function availableInventory(s: KitchenState, date: string): Batch[] {
  return remainingInventory(s).filter(
    (b) => b.confirmed && !isExpired(b, date),
  );
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
  ...ingredientAliases,
  糖: 'sugar',
  番茄: 'tomato',
  西红柿: 'tomato',
  鸡蛋: 'egg',
  青椒: 'green_pepper',
  食用油: 'oil',
  油: 'oil',
  水: 'water',
  饮用水: 'water',
  // Real kitchens distinguish cooked rice from the game's raw-rice artwork.
  米饭: 'cooked_rice',
  剩饭: 'cooked_rice',
  熟米饭: 'cooked_rice',
};

/** Upgrade legacy `other` records in memory without merging batches or inventing quantities. */
export function normalizePantryIdentities(state: KitchenState) {
  for (const batch of state.inventory) {
    if (batch.canonicalIngredientId !== 'other') continue;
    const id = aliases[batch.displayName];
    if (id && id !== 'other') batch.canonicalIngredientId = id;
  }
  for (const candidate of state.candidates) {
    if (
      candidate.canonicalIngredientId !== undefined &&
      candidate.canonicalIngredientId !== 'other'
    )
      continue;
    const id = aliases[candidate.displayName];
    if (id && id !== 'other') candidate.canonicalIngredientId = id;
  }
  return state;
}
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
    const suppliedIngredientId =
      typeof c.canonicalIngredientId === 'string' &&
      names[c.canonicalIngredientId]
        ? c.canonicalIngredientId
        : undefined;
    const locallyMatchedId = aliases[displayName];
    const canonicalIngredientId =
      locallyMatchedId || suppliedIngredientId || 'other';
    if (
      locallyMatchedId &&
      suppliedIngredientId &&
      locallyMatchedId !== suppliedIngredientId
    )
      notes.push(
        '输入类别与名称不一致，已按名称“' +
          displayName +
          '”匹配为“' +
          names[locallyMatchedId] +
          '”。',
      );
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
    if (
      inventoryIngredientId(target) !==
      inventoryIngredientId({
        canonicalIngredientId: input.ingredientId,
        displayName: input.name,
      })
    )
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
/** Call inside the storage transaction so a stale dialog cannot bypass the guard. */
export function clearKitchenInventory(s: KitchenState) {
  if (activeSession(s)) fail('请先完成正在做的一餐。');
  s.inventory = [];
  s.candidates = s.candidates.filter((c) => c.status !== 'pending');
}
export function recipeFor(s: KitchenState, id: string): Recipe {
  const recipe = recipes.find((r) => r.id === id);
  if (!recipe) fail('菜谱不存在。');
  const received = s.workbuddySteps?.[id];
  return received?.baseVersion === RECIPE_VERSION
    ? {
        ...recipe,
        steps: received.steps,
        // Generated prose has no verified per-step timer/material contract.
        detailSteps: undefined,
        workbuddyVersion: received.ticketId,
        workbuddyWarnings: received.warnings,
      }
    : recipe;
}
export function sessionRecipe(_s: KitchenState, session: Session): Recipe {
  // Legacy sessions predate generated steps and must keep the original preset.
  const recipe = storedRecipe(session);
  if (!recipe) fail('这餐的菜谱不存在。');
  return recipe;
}
export function detailRecipe(
  s: KitchenState,
  recipeId: string,
  sessionId?: string,
): Recipe {
  if (!sessionId) return recipeFor(s, recipeId);
  const session = s.sessions.find(
    (item) => item.id === sessionId && item.recipeId === recipeId,
  );
  if (!session) fail('这餐的记录不存在。');
  return sessionRecipe(s, session);
}
export function matching(
  s: KitchenState,
  r: Recipe,
  date = today(),
  servings = DEFAULT_SERVINGS,
) {
  return r.ingredients.map((i) => {
    const eligible = availableInventory(s, date).filter(
      (b) => inventoryIngredientId(b) === i.id,
    );
    const amount = eligible
      .filter((b) => b.unit === i.unit)
      .reduce((n, b) => n + (b.amount || 0), 0);
    return {
      ...i,
      // Having an ingredient is enough to discover and start a recipe.
      // Exact quantities remain separate for reference and compatible stock deductions.
      present: eligible.length > 0,
      need: i.amount * servings,
      have: amount,
      enough: amount >= i.amount * servings,
      unknown: eligible.some(
        (b) => b.amount === undefined || b.unit !== i.unit,
      ),
      // Presence helps discovery, but never proves that the required grams/ml are available.
      presenceOnly:
        (isSeasoning(i.id) || i.kind === 'seasoning') &&
        eligible.some((b) => b.amountBand === PRESENT_QUANTITY),
    };
  });
}
export function mealIngredients(
  s: KitchenState,
  r: Recipe,
  confirmations: MealConfirmation[] = [],
  date = today(),
  servings = DEFAULT_SERVINGS,
) {
  return matching(s, r, date, servings).map((item) => {
    const token = JSON.stringify([
      s.dataset,
      r.id,
      r.workbuddyVersion || RECIPE_VERSION,
      servings,
      item.id,
      item.need,
      item.unit,
      s.inventory
        .filter((b) => inventoryIngredientId(b) === item.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((b) => [
          b.id,
          b.revision,
          b.amount,
          b.unit,
          b.amountBand,
          b.expiryDate,
          isExpired(b, date),
        ]),
    ]);
    const confirmed =
      !item.present &&
      confirmations.some(
        (c) => c.ingredientId === item.id && c.token === token,
      );
    return {
      ...item,
      token,
      confirmed,
      ready: item.present || confirmed,
      mealOnlyAmount: Math.max(0, item.need - item.have),
    };
  });
}
export function recommendations(s: KitchenState, date = today()) {
  const inventory = availableInventory(s, date);
  return recipes
    .map((r) => {
      const matches = matching(s, r, date),
        missing = matches.filter((i) => !i.present);
      const urgent =
        matches.filter((i) =>
          inventory.some(
            (b) =>
              inventoryIngredientId(b) === i.id &&
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
    .filter((x) => x.matches.length > 0 && x.missing.length === 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.recipe.id.localeCompare(b.recipe.id, 'en'),
    )
    .slice(0, 3);
}
export function reviewed(s: KitchenState, r: Recipe) {
  return s.reviews[r.id]?.version === (r.workbuddyVersion || RECIPE_VERSION);
}
export function reviewRecipe(
  s: KitchenState,
  recipeId: string,
  by: string,
  expectedVersion = RECIPE_VERSION,
) {
  if (!recipes.some((r) => r.id === recipeId)) fail('菜谱不存在。');
  const version = recipeFor(s, recipeId).workbuddyVersion || RECIPE_VERSION;
  if (version !== expectedVersion) fail('做法版本已更新，请重新查看并核对。');
  s.reviews[recipeId] = {
    by: short(by, '审校人', 50),
    at: new Date().toISOString(),
    version,
  };
}
export function startCooking(
  s: KitchenState,
  recipeId: string,
  id = uid(),
  date = today(),
  expectedVersion?: string,
  confirmations: MealConfirmation[] = [],
) {
  if (s.sessions.some((x) => x.id === id)) return;
  if (activeSession(s)) fail('还有一餐未完成，请先继续当前一餐。');
  const r = recipeFor(s, recipeId);
  if (
    expectedVersion &&
    expectedVersion !== (r.workbuddyVersion || RECIPE_VERSION)
  )
    fail('做法版本已更新，请重新查看并核对。');
  // The page requires the meal-specific food/equipment checkbox, not a named reviewer.
  // Recheck confirmations inside the storage transaction, against its latest stock.
  const ingredients = mealIngredients(s, r, confirmations, date);
  if (
    new Set(confirmations.map((c) => c.ingredientId)).size !==
      confirmations.length ||
    confirmations.some(
      (c) =>
        !ingredients.some(
          (i) => i.id === c.ingredientId && i.confirmed && i.token === c.token,
        ),
    )
  )
    fail('本餐食材确认已变化，请重新确认拥有。');
  if (ingredients.some((item) => !item.ready))
    fail('食材库存未备齐或已改变，请重新核对并确认本餐拥有所需食材。');
  const mealOnlyIngredients = ingredients
    .filter((i) => i.confirmed)
    .map((i) => ({
      ingredientId: i.id,
      amount: i.mealOnlyAmount,
      unit: i.unit,
    }));
  // Every meal fixes its own real-stock plan; later restocks are not a substitute.
  const stockAllocation = allocateStock(s, r, DEFAULT_SERVINGS, date);
  s.sessions.unshift({
    id,
    recipeId,
    recipeVersion: r.workbuddyVersion || RECIPE_VERSION,
    recipeSnapshot: structuredClone(r),
    servings: DEFAULT_SERVINGS,
    status: 'cooking',
    step: 0,
    createdAt: new Date().toISOString(),
    inventorySnapshot: structuredClone(s.inventory),
    stockAllocation,
    ...(mealOnlyIngredients.length ? { mealOnlyIngredients } : {}),
  });
}
export function stepSession(s: KitchenState, id: string, step: number) {
  const session = s.sessions.find((x) => x.id === id);
  if (!session || session.status === 'completed') fail('这餐已结束或不存在。');
  const r = sessionRecipe(s, session);
  if (!Number.isInteger(step) || step < 0 || step > r.steps.length)
    fail('无效步骤。');
  session.step = step;
  session.status = step === r.steps.length ? 'reviewing' : 'cooking';
  delete session.timerEnd;
  delete session.timerRemaining;
}
function allocateStock(
  s: KitchenState,
  r: Recipe,
  servings: number,
  date = today(),
): StockAllocation[] {
  const result: StockAllocation[] = [];
  for (const ingredient of r.ingredients) {
    let need = ingredient.amount * servings;
    const candidates = availableInventory(s, date)
      .filter((b) => inventoryIngredientId(b) === ingredient.id)
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
        amount: consumed,
        unit: b.unit,
      });
    }
  }
  return result;
}
export function remainingPlan(
  s: KitchenState,
  r: Recipe,
  servings: number,
  date = today(),
): Consumption[] {
  // Retain the original prefill semantics for sessions without meal-only provisions.
  return allocateStock(s, r, servings, date).map((use) => {
    const batch = s.inventory.find((b) => b.id === use.batchId)!;
    return {
      batchId: batch.id,
      expectedRevision: batch.revision,
      remaining: {
        amount: Math.round((batch.amount! - use.amount) * 1000) / 1000,
        unit: use.unit,
      },
    };
  });
}
export function sessionRemainingPlan(
  s: KitchenState,
  session: Session,
): Consumption[] {
  if (!session.stockAllocation)
    return remainingPlan(s, sessionRecipe(s, session), session.servings);
  return session.stockAllocation.map((use) => {
    const current = s.inventory.find((b) => b.id === use.batchId);
    const original = session.inventorySnapshot.find(
      (b) => b.id === use.batchId,
    )!;
    const compatible =
      current?.amount !== undefined &&
      current.unit === use.unit &&
      inventoryIngredientId(current) === inventoryIngredientId(original);
    const batch = compatible ? current! : original;
    return {
      batchId: use.batchId,
      // A removed/retyped batch stays stale until the user explicitly removes it.
      expectedRevision: compatible ? batch.revision : -1,
      remaining: {
        // Never round down past the saved allocation: inventory accepts decimals.
        amount: Math.max(0, batch.amount! - use.amount),
        unit: use.unit,
      },
    };
  });
}
export function mealStockLimit(
  session: Session,
  batch: Batch,
): number | undefined {
  const original = session.inventorySnapshot.find((b) => b.id === batch.id);
  const hasMealOnlyPortion = session.mealOnlyIngredients?.some(
    (i) =>
      i.ingredientId === inventoryIngredientId(batch) ||
      (original && i.ingredientId === inventoryIngredientId(original)),
  );
  if (!hasMealOnlyPortion) return undefined;
  const allocation = session.stockAllocation?.find(
    (a) => a.batchId === batch.id,
  );
  return allocation &&
    allocation.unit === batch.unit &&
    original &&
    inventoryIngredientId(original) === inventoryIngredientId(batch)
    ? allocation.amount
    : 0;
}
export function completeCooking(
  s: KitchenState,
  id: string,
  review: {
    rating?: number;
    ratings?: MealRatings;
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
  const ratings =
    review.ratings === undefined
      ? undefined
      : validateMealRatings(review.ratings);
  if (
    !ratings &&
    (review.rating === undefined ||
      !Number.isInteger(review.rating) ||
      review.rating < 1 ||
      review.rating > 5)
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
    const limit = mealStockLimit(session, batch);
    if (
      limit !== undefined &&
      (batch.amount === undefined ||
        q.amount === undefined ||
        batch.amount - q.amount > limit + 0.000001)
    )
      fail('本餐临时确认的食材不扣冰箱库存；只能核对开做时已分配的库存用量。');
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
    ...(ratings ? { ratings } : { userRating: review.rating }),
    familyMemory: review.memory,
    photo: review.photo,
    actualConsumption: review.consumption,
  });
  delete session.timerEnd;
  delete session.timerRemaining;
  delete session.reviewDraft;
}
/** Simple feedback flow: compute the saved recipe's deduction inside db.change. */
export function finishCooking(
  s: KitchenState,
  id: string,
  feedback: { ratings: MealRatings; memory: string; photo?: string },
  at = new Date().toISOString(),
) {
  const session = s.sessions.find((x) => x.id === id);
  if (!session) fail('烹饪记录不存在。');
  if (session.status === 'completed') return;
  if (session.status !== 'reviewing') fail('请先完成跟做，再记录这一餐。');
  const ratings = validateMealRatings(feedback.ratings);
  let allocation = session.stockAllocation;
  if (!allocation) {
    // Older meals never borrow newly added stock. Use the original local start
    // day, not today, so a meal finished after midnight retains its original plan.
    const began = new Date(session.createdAt);
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(session.createdAt)
      ? session.createdAt
      : [
          began.getFullYear(),
          String(began.getMonth() + 1).padStart(2, '0'),
          String(began.getDate()).padStart(2, '0'),
        ].join('-');
    allocation = Number.isNaN(began.getTime())
      ? []
      : allocateStock(
          { ...s, inventory: session.inventorySnapshot },
          sessionRecipe(s, session),
          session.servings,
          startDate,
        );
  }
  const consumption: Consumption[] = [];
  for (const use of allocation) {
    const original = session.inventorySnapshot.find(
      (b) => b.id === use.batchId,
    );
    const current = s.inventory.find((b) => b.id === use.batchId);
    // Removed, retyped or imprecise rows are left untouched, never replaced.
    if (
      !original ||
      !current ||
      current.amount === undefined ||
      current.amount <= 0 ||
      current.unit !== use.unit ||
      inventoryIngredientId(current) !== inventoryIngredientId(original)
    )
      continue;
    consumption.push({
      batchId: current.id,
      expectedRevision: current.revision,
      remaining: {
        amount: Math.max(0, current.amount - use.amount),
        unit: current.unit,
      },
    });
  }
  // Ignore legacy draft.consumption: only the photo, score and comment are input.
  completeCooking(s, id, { ...feedback, ratings, consumption }, at);
  session.consumptionMode = 'recipe-plan';
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
