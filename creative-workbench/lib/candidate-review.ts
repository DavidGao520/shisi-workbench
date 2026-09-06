import {
  confirmCandidate,
  stage,
  uid,
  type Candidate,
  type KitchenState,
  type Quantity,
} from './kitchen';
import { inventoryIngredientId } from './recipes';

/** Identity and inventory linkage are internal, not extra tasks for the cook. */
export function candidateReview(state: KitchenState, candidate: Candidate) {
  const ingredientId = inventoryIngredientId(candidate);
  const matches = state.inventory.filter(
    (b) =>
      inventoryIngredientId(b) === ingredientId &&
      (ingredientId !== 'other' || b.displayName === candidate.displayName),
  );
  const explicit = candidate.stocktakeTarget;
  const target =
    candidate.mode === 'stocktake'
      ? explicit
        ? matches.find((b) => b.id === explicit.id)
        : matches.length === 1
          ? matches[0]
          : undefined
      : undefined;
  const problem =
    explicit && (!target || target.revision !== explicit.revision)
      ? '这份库存已变化，请从库存卡片重新打开校准余量。'
      : candidate.mode === 'stocktake' && !explicit && matches.length > 1
        ? '已有多份同名食材，请在下方库存卡片分别校准余量；这项可先不记录。'
        : '';
  return {
    ingredientId,
    name: candidate.displayName,
    mode: candidate.mode,
    targetId: target?.id,
    targetRevision: target?.revision,
    expiryDate: target?.expiryDate,
    quantity:
      candidate.amount === undefined && !candidate.amountBand && target
        ? {
            amount: target.amount,
            unit: target.unit,
            amountBand: target.amountBand,
          }
        : {
            amount: candidate.amount,
            unit: candidate.unit,
            amountBand: candidate.amountBand,
          },
    // Detect new or changed matching records before writing, including a new-batch race.
    fingerprint: JSON.stringify(
      matches
        .sort((a, b) => a.id.localeCompare(b.id, 'en'))
        .map((b) => [b.id, b.revision]),
    ),
    problem,
  };
}

export function confirmReviewedCandidate(
  state: KitchenState,
  key: string,
  review: ReturnType<typeof candidateReview>,
  input: { quantity: Quantity; expiryDate?: string },
) {
  const candidate = state.candidates.find((c) => c.key === key);
  if (!candidate) throw new Error('候选不存在，请重新读取。');
  if (candidate.status !== 'pending') return;
  const current = candidateReview(state, candidate);
  if (current.problem) throw new Error(current.problem);
  if (
    review.problem ||
    current.fingerprint !== review.fingerprint ||
    current.ingredientId !== review.ingredientId ||
    current.name !== review.name ||
    current.mode !== review.mode ||
    current.targetId !== review.targetId
  )
    throw new Error('库存已变化，请重新核对数量后确认。');
  confirmCandidate(state, key, {
    name: current.name,
    ingredientId: current.ingredientId,
    quantity: input.quantity,
    expiryDate: input.expiryDate,
    targetId: current.targetId,
    targetRevision: current.targetRevision,
  });
}

export function inventoryEditCandidate(
  state: KitchenState,
  id: string,
): Candidate {
  const batch = state.inventory.find((b) => b.id === id);
  if (!batch) throw new Error('这份食材已不存在，请重新读取库存。');
  const requestId = uid();
  return {
    key: JSON.stringify([requestId, 'edit']),
    candidateId: 'edit',
    requestId,
    displayName: batch.displayName,
    canonicalIngredientId: batch.canonicalIngredientId,
    amount: batch.amount,
    unit: batch.unit,
    amountBand: batch.amountBand,
    warnings: [],
    mode: 'stocktake',
    source: 'manual-form',
    status: 'pending',
    stocktakeTarget: { id: batch.id, revision: batch.revision },
  };
}

export function stageInventoryEditCandidate(
  state: KitchenState,
  id: string,
): Candidate {
  const batch = state.inventory.find((item) => item.id === id);
  if (!batch) throw new Error('这份食材已不存在，请重新读取库存。');
  const existing = state.candidates.find(
    (candidate) =>
      candidate.status === 'pending' &&
      candidate.mode === 'stocktake' &&
      candidate.stocktakeTarget?.id === batch.id &&
      candidate.stocktakeTarget.revision === batch.revision,
  );
  if (existing) return existing;
  const candidate = inventoryEditCandidate(state, id);
  stage(state, [candidate]);
  return candidate;
}
