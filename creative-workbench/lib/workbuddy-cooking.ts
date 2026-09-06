import { names, recipes, RECIPE_VERSION } from './recipes';
import type { Dataset, KitchenState } from './kitchen';
import {
  validateCookingRequest,
  validateCookingResult,
  type CookingRequest,
  type CookingResult,
} from '../skills/zhonghua-shisi/scripts/cooking-contract.mjs';

export type CookingDelivery = {
  ticketId: string;
  request: CookingRequest;
  result: CookingResult;
  createdAt: string;
};
export type CookingTicket = {
  ticketId: string;
  dataset: Dataset;
  recipeId: string;
  title: string;
  status: string;
  expiresAt: number;
};
export function cookingRequest(dataset: Dataset, recipeId: string) {
  const recipe = recipes.find((recipe) => recipe.id === recipeId);
  if (!recipe) throw new Error('请先选择一道菜。');
  return validateCookingRequest({
    dataset,
    recipeId,
    baseVersion: RECIPE_VERSION,
    title: recipe.title,
    servings: recipe.baseServings || 1,
    ingredients: recipe.ingredients.map((item) => ({
      id: item.id,
      name: item.name || names[item.id],
      amount: item.amount,
      unit: item.unit,
    })),
  });
}
export function checkCookingDelivery(entry: CookingDelivery, dataset: Dataset) {
  if (
    !entry ||
    !/^[a-f0-9-]{36}$/.test(entry.ticketId) ||
    !entry.request ||
    entry.request.dataset !== dataset ||
    typeof entry.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.createdAt))
  )
    throw new Error('做法不属于当前厨房或任务，未保存。');
  const request = validateCookingRequest(entry.request);
  if (
    JSON.stringify(request) !==
    JSON.stringify(cookingRequest(dataset, request.recipeId))
  )
    throw new Error('这道菜的用料版本已改变，请重新生成做法。');
  return validateCookingResult(entry.result, request);
}
export function receiveCookingSteps(
  state: KitchenState,
  entry: CookingDelivery,
) {
  if (state.bridgeIgnoredTicketIds?.includes(entry.ticketId)) return false;
  const result = checkCookingDelivery(entry, state.dataset);
  if (state.workbuddyReceivedTickets?.includes(entry.ticketId)) return false;
  state.workbuddySteps ??= {};
  state.workbuddySteps[entry.request.recipeId] = {
    ticketId: entry.ticketId,
    baseVersion: entry.request.baseVersion,
    steps: result.steps,
    warnings: result.warnings,
    createdAt: entry.createdAt,
  };
  state.workbuddyReceivedTickets = [
    ...(state.workbuddyReceivedTickets || []),
    entry.ticketId,
  ].slice(-200);
  return true;
}
/** Persist before cancelling transport so a delayed read in another tab cannot restore it. */
export function ignoreCookingTicket(
  state: KitchenState,
  ticket: CookingTicket,
) {
  if (state.dataset !== ticket.dataset)
    throw new Error('厨房已切换，未取消另一厨房的任务。');
  state.bridgeIgnoredTicketIds = [
    ...new Set([...(state.bridgeIgnoredTicketIds || []), ticket.ticketId]),
  ];
}
