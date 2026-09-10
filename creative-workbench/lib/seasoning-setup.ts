import {
  isSeasoning,
  PRESENT_QUANTITY,
  seasoningNames,
  seasonings,
} from './seasonings';
import {
  defaultExpiryDate,
  isExpired,
  today,
  uid,
  type Dataset,
  type KitchenState,
} from './kitchen';

/** Existing usable batches are evidence of ownership, never a license to overwrite quantities. */
export function ownedSeasonings(state: KitchenState, date = today()) {
  return new Set(
    state.inventory
      .filter(
        (batch) =>
          isSeasoning(batch.canonicalIngredientId) &&
          !isExpired(batch, date) &&
          (batch.amount === undefined
            ? !!batch.amountBand && batch.amountBand !== '用完'
            : batch.amount > 0),
      )
      .map((batch) => batch.canonicalIngredientId),
  );
}

/** Call only from a visible user confirmation, inside one IndexedDbStore.change transaction. */
export function confirmSeasoningSetup(
  state: KitchenState,
  input: {
    dataset: Dataset;
    selectedIds: string[];
    operationId: string;
    skip?: boolean;
  },
  at = new Date().toISOString(),
  date = today(),
) {
  if (input.dataset !== state.dataset)
    throw new Error('厨房已切换，请重新选择调料。');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(input.operationId))
    throw new Error('本次选择标识无效，请重新打开调料清单。');
  if (
    !Array.isArray(input.selectedIds) ||
    input.selectedIds.length > seasonings.length ||
    input.selectedIds.some((id) => typeof id !== 'string' || !isSeasoning(id))
  )
    throw new Error('清单包含未知调料，尚未保存，请重新选择。');
  const selected = [...new Set(input.selectedIds)];
  if (input.skip ? selected.length > 0 : selected.length === 0)
    throw new Error('请勾选家里有的调料，或者选择暂时跳过。');
  if (!Number.isFinite(Date.parse(at))) throw new Error('保存时间无效。');
  if (state.seasoningSetup?.receipts.includes(input.operationId)) return 0;

  const owned = ownedSeasonings(state, date);
  const additions = selected
    .filter((id) => !owned.has(id))
    .map((id) => ({
      id: uid(),
      displayName: seasoningNames[id],
      canonicalIngredientId: id,
      amountBand: PRESENT_QUANTITY,
      revision: 1,
      confirmed: true as const,
      expiryDate: defaultExpiryDate(at),
      createdAt: at,
      updatedAt: at,
    }));
  state.inventory.push(...additions);
  state.seasoningSetup = {
    version: 1,
    completedAt: at,
    skipped: !!input.skip,
    receipts: [...(state.seasoningSetup?.receipts || []), input.operationId],
  };
  return additions.length;
}

/** Existing kitchens get a non-blocking entry; only a genuinely empty real kitchen gets the first-run sheet. */
export function needsSeasoningOnboarding(state: KitchenState) {
  return (
    state.dataset === 'real' &&
    !state.seasoningSetup &&
    !state.inventory.length &&
    !state.candidates.length &&
    !state.sessions.length
  );
}
