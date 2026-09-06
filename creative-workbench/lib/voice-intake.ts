import { names, ingredientAliases, inventoryIngredientId } from './recipes';
import { PRESENT_QUANTITY } from './seasonings';
import {
  confirmCandidate,
  parseImport,
  stage,
  uid,
  validateQuantity,
  type Candidate,
  type Dataset,
  type KitchenState,
  type Mode,
  type Quantity,
} from './kitchen';

const extraFoods =
  '鸡肉 猪肉 牛肉 羊肉 五花肉 排骨 鸡胸肉 鸡腿 鸡翅 虾 鱼肉 鲫鱼 鲈鱼 带鱼 三文鱼 鱿鱼 贝类 香肠 火腿 培根 鸭肉 胡萝卜 白萝卜 洋葱 大蒜 生姜 小葱 香菜 香菇 蘑菇 金针菇 木耳 白菜 大白菜 娃娃菜 油麦菜 生菜 菠菜 西兰花 花菜 茄子 黄瓜 冬瓜 南瓜 丝瓜 西葫芦 豆角 四季豆 荷兰豆 玉米 红薯 山药 莲藕 芹菜 韭菜 小白菜 青菜 彩椒 红椒 面条 面粉 挂面 馒头 饺子 面包 燕麦 牛奶 酸奶 黄油 奶酪 红豆 绿豆 黄豆 花生 核桃 芝麻 苹果 香蕉 橙子 柠檬 草莓 葡萄 酱油 红糖 冰糖'.split(
    ' ',
  );
const baseLexicon = new Map<string, string>([
  ...extraFoods.map((name) => [name, 'other'] as [string, string]),
  // These are whole processed-food names, not evidence of raw tofu/egg/meat.
  ...'毛豆腐 鱼豆腐 臭豆腐 油豆腐 豆腐干 豆腐皮 鸡蛋干 素鸡 素肉'
    .split(' ')
    .map((name) => [name, 'other'] as [string, string]),
  ...Object.entries(names)
    .filter(([id]) => id !== 'other')
    .map(([id, name]) => [name, id] as [string, string]),
  ...Object.entries(ingredientAliases),
  ['西红柿', 'tomato'],
  ['剩饭', 'cooked_rice'],
  ['米饭', 'cooked_rice'],
  ['大米', 'rice'],
  ['糖', 'sugar'],
  ['油', 'oil'],
  ['水', 'water'],
]);
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digit: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
export function spokenNumber(raw: string): number | undefined {
  if (raw === '半') return 0.5;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (/^[一二两三四五六七八九]{2,}$/.test(raw)) return undefined; // 两三 / 三四 are ranges, not 23 / 34.
  if (/(?:百|千)[一二两三四五六七八九]$/.test(raw)) return undefined; // 一百二 / 一千五 are colloquial, not 102 / 1005.
  const parts = raw.split('点');
  if (parts.length > 2) return undefined;
  let total = 0,
    current = 0;
  for (const c of parts[0]) {
    if (c in digit) current = digit[c];
    else if ('十百千'.includes(c)) {
      total += (current || 1) * { 十: 10, 百: 100, 千: 1000 }[c]!;
      current = 0;
    } else return undefined;
  }
  const fraction = parts[1]
    ? parts[1]
        .split('')
        .map((c) => digit[c] ?? '?')
        .join('')
    : '';
  if (fraction.includes('?')) return undefined;
  return total + current + (fraction ? Number('0.' + fraction) : 0);
}
const numberToken = '[零〇一二两三四五六七八九十百千点半\\d.]+';
const measure =
  '(公斤|千克|毫升|个|枚|只|盒|袋|克|斤|两|升|份|瓶|碗|根|把|块|包|罐|颗)';
const beforeQuantity = new RegExp(
  '(' + numberToken + ')\\s*' + measure + '\\s*(?:的)?$',
);
const afterQuantity = new RegExp(
  '^\\s*(?:还有|有|还剩|剩|大约|约)?\\s*(' + numberToken + ')\\s*' + measure,
);
const negative =
  /没有|没买|没了|用完|吃完|不要|别记|不记|不加|不剩|不是|(?:想|准备|打算|需要|要|计划)(?:买|做|吃)/;

export function extractIngredients(
  transcript: string,
  knownFoods: { displayName: string; canonicalIngredientId?: string }[] = [],
) {
  if (!transcript.trim() || transcript.length > 10000)
    throw new Error('请先说出食材，或修改识别文字。');
  const lexicon = new Map(baseLexicon);
  for (const item of knownFoods) {
    if (item.displayName.trim() && item.displayName.length <= 60) {
      lexicon.set(item.displayName, inventoryIngredientId(item));
    }
  }
  const wordPattern = new RegExp(
    [...lexicon.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapePattern)
      .join('|'),
    'g',
  );
  const found = new Map<
    string,
    {
      displayName: string;
      canonicalIngredientId: string;
      rawMention: string;
      warnings: string[];
    } & Quantity
  >();
  const notes: string[] = [];
  let unresolved = false;
  for (const clause of transcript
    .split(/[，,。！？!?；;\n]|但是|不过|但/)
    .filter(Boolean)) {
    const matches = [...clause.matchAll(wordPattern)];
    if (!matches.length) {
      unresolved = true;
      continue;
    }
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i],
        word = match[0],
        at = match.index!,
        end = at + word.length;
      const before = clause.slice(
        i ? matches[i - 1].index! + matches[i - 1][0].length : 0,
        at,
      );
      const after = clause.slice(end, matches[i + 1]?.index ?? clause.length);
      // A negative/planned clause is not evidence of stock; never decrement from it.
      if (
        negative.test(clause.slice(0, at)) ||
        /都(?:没有|没了|用完|吃完)/.test(clause) ||
        /^(?:都)?(?:没有|没了|用完|吃完|不要)/.test(after.trim())
      ) {
        notes.push(
          '未加入「' +
            word +
            '」：这段话表示没有、已用完或计划购买；原库存未改变。',
        );
        continue;
      }
      const id = lexicon.get(word)!;
      const name = id === 'other' ? word : names[id];
      const warnings: string[] = [];
      let q: Quantity = {};
      const prefix = before.match(beforeQuantity);
      // A postfix amount followed by another food belongs to that next food unless separated by a connector.
      const suffix = after.match(afterQuantity);
      const useSuffix =
        suffix &&
        (i === matches.length - 1 ||
          /[和与跟及、]/.test(after.slice(suffix[0].length)));
      const quantity = prefix || (useSuffix ? suffix : null);
      if (quantity) {
        let amount = spokenNumber(quantity[1]),
          unit = quantity[2];
        if (amount !== undefined) {
          const factor = (
            { 公斤: 1000, 千克: 1000, 斤: 500, 两: 50, 升: 1000 } as Record<
              string,
              number
            >
          )[unit];
          if (factor) {
            warnings.push(
              '按' +
                unit +
                '换算为' +
                (unit === '升' ? '毫升' : '克') +
                '，请核对。',
            );
            amount *= factor;
            unit = unit === '升' ? '毫升' : '克';
          }
          if (unit === '枚' && id === 'egg') unit = '个';
          if (['个', '盒', '袋', '克', '毫升', '份'].includes(unit))
            q = { amount, unit };
          else
            warnings.push(
              '原话单位为「' + unit + '」，请核对数量；未猜测容量或重量。',
            );
          if (unit === '盒' || unit === '袋')
            warnings.push('按包装记录，不推断盒内或袋内个数。');
        } else warnings.push('原话数量不明确，请核对。');
      } else if (/(?:一点|有点|少量)/.test(before + after))
        q = { amountBand: '少量' };
      if (
        (prefix && suffix) ||
        /不对|改成|说错|应该是|大概|大约|差不多|大半|半个多|左右|(?:两|三|四)个?多|负|[-−~～至到]/.test(
          clause,
        )
      ) {
        q = {};
        warnings.push('包含估计或改口，数量需要核对。');
      }
      const key = id === 'other' ? 'other:' + name : id;
      if (found.has(key)) {
        const previous = found.get(key)!;
        delete previous.amount;
        delete previous.unit;
        delete previous.amountBand;
        previous.warnings.push('重复提到同一食材，未自动相加，请核对总量。');
        continue;
      }
      found.set(key, {
        ...q,
        displayName: name,
        canonicalIngredientId: id,
        rawMention: clause.trim().slice(0, 500),
        warnings,
      });
    }
  }
  if (unresolved)
    notes.push(
      '有些片段未匹配到常见食材，请核对清单；遗漏的可修改文字或手动补充。',
    );
  if (/不对|改成|说错|应该是/.test(transcript))
    for (const item of found.values()) {
      delete item.amount;
      delete item.unit;
      delete item.amountBand;
      item.warnings.push('原话有改口，请核对最终数量。');
    }
  if (found.size > 50) throw new Error('一次最多录入 50 种食材，请分批说。');
  return {
    items: [...found.values()].map((c, i) => ({
      ...c,
      candidateId: 'voice-' + i,
    })),
    warnings: [...new Set(notes)],
  };
}

export type VoiceRow = {
  candidate: Candidate;
  selected: boolean;
  name: string;
  ingredientId: string;
  amount: string;
  unit: string;
  amountBand: string;
  targetId: string;
  targetRevision?: number;
  expiryDate?: string;
  expectedInventoryRevision: number;
};
export function prepareVoiceDraft(
  transcript: string,
  state: KitchenState,
  mode: Mode,
  requestId = uid(),
) {
  const parsed = extractIngredients(transcript, state.inventory);
  if (!parsed.items.length)
    return { rows: [] as VoiceRow[], warnings: parsed.warnings };
  const candidates = parseImport(
    JSON.stringify({
      schemaVersion: '1.0',
      requestId,
      dataset: state.dataset,
      mode,
      source: 'gateway-text',
      transcript,
      createdAt: new Date().toISOString(),
      warnings: [],
      candidates: parsed.items,
    }),
    state.dataset,
    mode,
  );
  const rows = candidates.map((candidate) => {
    const existing = state.inventory.filter(
      (b) =>
        inventoryIngredientId(b) === inventoryIngredientId(candidate) &&
        (inventoryIngredientId(b) !== 'other' ||
          b.displayName === candidate.displayName),
    );
    const target =
      existing.length === 1 && mode === 'stocktake' ? existing[0] : undefined;
    const quantity =
      candidate.amount === undefined && !candidate.amountBand && target
        ? target
        : candidate;
    if (quantity === target)
      candidate.warnings.push(
        '原话未说数量，先保留该批次原有数量，可在这里修改。',
      );
    return {
      candidate,
      selected: true,
      name: candidate.displayName,
      ingredientId: candidate.canonicalIngredientId || 'other',
      amount: quantity.amount === undefined ? '' : String(quantity.amount),
      unit: quantity.unit || '个',
      amountBand: quantity.amountBand || PRESENT_QUANTITY,
      targetId:
        target?.id ||
        (existing.length > 1 && mode === 'stocktake' ? 'choose' : ''),
      targetRevision: target?.revision,
      expiryDate: target?.expiryDate,
      expectedInventoryRevision: state.revision,
    };
  });
  return { rows, warnings: parsed.warnings };
}
export function confirmVoiceDraft(
  state: KitchenState,
  dataset: Dataset,
  rows: VoiceRow[],
) {
  if (state.dataset !== dataset)
    throw new Error('厨房已切换，请重新核对本次语音。');
  const selected = rows.filter((row) => row.selected);
  if (!selected.length || selected.length > 50)
    throw new Error('请至少选择一种食材。');
  const keys = new Set<string>(),
    targets = new Set<string>();
  for (const row of selected) {
    if (
      !state.candidates.some(
        (c) => c.key === row.candidate.key && c.status !== 'pending',
      ) &&
      row.expectedInventoryRevision !== state.revision
    )
      throw new Error('库存已变化，请按当前文字重新识别清单后核对入库。');
    if (keys.has(row.candidate.key)) throw new Error('同一候选不能重复确认。');
    keys.add(row.candidate.key);
    if (row.targetId === 'choose')
      throw new Error(
        '已有多份同名食材，请取消这一项，并在库存卡片分别校准余量。',
      );
    if (row.targetId && targets.has(row.targetId))
      throw new Error('多个食材不能同时校准同一个批次。');
    if (row.targetId) targets.add(row.targetId);
    validateQuantity(
      row.amount.trim()
        ? { amount: Number(row.amount), unit: row.unit }
        : { amountBand: row.amountBand },
    );
  }
  let count = 0;
  stage(
    state,
    selected.map((row) => structuredClone(row.candidate)),
  );
  for (const row of selected) {
    if (
      state.candidates.find((c) => c.key === row.candidate.key)?.status !==
      'pending'
    )
      continue;
    confirmCandidate(state, row.candidate.key, {
      name: row.name,
      ingredientId: row.ingredientId,
      quantity: row.amount.trim()
        ? { amount: Number(row.amount), unit: row.unit }
        : { amountBand: row.amountBand },
      targetId: row.targetId || undefined,
      targetRevision: row.targetRevision,
      expiryDate: row.expiryDate,
    });
    count++;
  }
  return count;
}
