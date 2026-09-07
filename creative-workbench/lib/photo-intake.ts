import {
  parseImport,
  stage,
  type Dataset,
  type KitchenState,
  type Mode,
} from './kitchen';
import { inventoryIngredientId } from './recipes';

export const MAX_PHOTO_ITEMS = 40;
export type PhotoIngredient = {
  displayName: string;
  amount?: number;
  unit?: string;
};
const countUnits = ['个', '盒', '袋', '棵'];

/** Model output is data, never inventory commands, IDs, dates or routing. */
export function parsePhotoIngredients(value: unknown): PhotoIngredient[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('照片识别结果不完整，请重试。');
  const list = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(list) || list.length > MAX_PHOTO_ITEMS)
    throw new Error('照片识别结果不完整，请分开拍摄。');
  const seen = new Set<string>();
  return list.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('照片识别结果不完整，请重试。');
    const row = item as Record<string, unknown>;
    if (
      typeof row.displayName !== 'string' ||
      !row.displayName.trim() ||
      row.displayName.length > 40
    )
      throw new Error('照片中的食材名称不清楚，请重新拍摄。');
    const displayName = row.displayName.trim();
    const id = inventoryIngredientId({ displayName });
    const identity = id === 'other' ? 'name:' + displayName : 'id:' + id;
    if (
      displayName
        .split('')
        .some(
          (c) =>
            c.charCodeAt(0) < 32 ||
            c.charCodeAt(0) === 127 ||
            c === '<' ||
            c === '>',
        ) ||
      seen.has(identity)
    )
      throw new Error('照片识别结果有重复或无效食材，请重新拍摄。');
    seen.add(identity);
    // Only visible whole-object counts. Never estimate weight, volume or freshness.
    return {
      displayName,
      ...(Number.isInteger(row.amount) &&
      Number(row.amount) > 0 &&
      Number(row.amount) <= 100 &&
      countUnits.includes(String(row.unit))
        ? { amount: Number(row.amount), unit: String(row.unit) }
        : {}),
    };
  });
}

export type PhotoDraft = {
  requestId: string;
  dataset: Dataset;
  mode: Mode;
  candidates: PhotoIngredient[];
};

export function stagePhotoDraft(state: KitchenState, draft: PhotoDraft) {
  if (state.dataset !== draft.dataset)
    throw new Error('厨房已切换，请重新选择照片。');
  const candidates = parsePhotoIngredients({ candidates: draft.candidates });
  if (!candidates.length)
    throw new Error('照片中没有识别到食材，请换一张清晰照片。');
  return stage(
    state,
    parseImport(
      JSON.stringify({
        schemaVersion: '1.0',
        requestId: draft.requestId,
        dataset: draft.dataset,
        mode: draft.mode,
        source: 'gateway-image',
        createdAt: new Date().toISOString(),
        warnings: [],
        candidates: candidates.map((item, index) => ({
          ...item,
          candidateId: 'photo-' + index,
          warnings: [],
        })),
      }),
      draft.dataset,
      draft.mode,
    ),
  );
}
