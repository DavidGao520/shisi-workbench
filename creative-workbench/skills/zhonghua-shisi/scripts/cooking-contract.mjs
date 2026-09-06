// Data-only handoff between the kitchen page and the user's WorkBuddy Skill.
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' && !!v.trim() && v.length <= max;
const only = (v, keys) => Object.keys(v).every((key) => keys.includes(key));
/** @typedef {{dataset:'real'|'demo',recipeId:string,baseVersion:string,title:string,servings:number,ingredients:{id:string,name:string,amount:number,unit:string}[]}} CookingRequest */
/** @returns {CookingRequest} */
export function validateCookingRequest(input) {
  if (
    !object(input) ||
    !only(input, [
      'dataset',
      'recipeId',
      'baseVersion',
      'title',
      'servings',
      'ingredients',
    ]) ||
    !['real', 'demo'].includes(input.dataset) ||
    !text(input.recipeId, 80) ||
    !text(input.baseVersion, 100) ||
    !text(input.title, 60) ||
    !Number.isInteger(input.servings) ||
    input.servings < 1 ||
    input.servings > 12 ||
    !Array.isArray(input.ingredients) ||
    !input.ingredients.length ||
    input.ingredients.length > 30
  )
    fail('菜名或用料不完整，请重新选择这道菜。');
  const ids = new Set();
  const ingredients = input.ingredients.map((item) => {
    if (
      !object(item) ||
      !only(item, ['id', 'name', 'amount', 'unit']) ||
      !text(item.id, 80) ||
      ids.has(item.id) ||
      !text(item.name, 60) ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0 ||
      item.amount > 1000000 ||
      !['个', '盒', '袋', '棵', '克', '毫升', '份'].includes(item.unit)
    )
      fail('菜谱用料无效，未创建任务。');
    ids.add(item.id);
    return {
      id: item.id,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
    };
  });
  return {
    dataset: input.dataset,
    recipeId: input.recipeId,
    baseVersion: input.baseVersion,
    title: input.title,
    servings: input.servings,
    ingredients,
  };
}
/** @typedef {{schemaVersion:'1.0',recipeId:string,title:string,steps:string[],warnings:string[]}} CookingResult */
/** @param {unknown} input @param {CookingRequest} request @returns {CookingResult} */
export function validateCookingResult(input, request) {
  if (
    !object(input) ||
    !only(input, ['schemaVersion', 'recipeId', 'title', 'steps', 'warnings']) ||
    input.schemaVersion !== '1.0' ||
    input.recipeId !== request.recipeId ||
    input.title !== request.title ||
    !Array.isArray(input.steps) ||
    input.steps.length < 3 ||
    input.steps.length > 20 ||
    input.steps.some((step) => !text(step, 800)) ||
    !Array.isArray(input.warnings) ||
    input.warnings.length > 10 ||
    input.warnings.some((warning) => !text(warning, 300))
  )
    fail('做法与所选菜品不一致或步骤不完整，未接收。');
  return {
    schemaVersion: '1.0',
    recipeId: request.recipeId,
    title: request.title,
    steps: input.steps.map((step) => step.trim()),
    warnings: input.warnings.map((warning) => warning.trim()),
  };
}
export const cookingTaskSummary = (job) =>
  job
    ? {
        ticketId: job.id,
        dataset: job.request.dataset,
        recipeId: job.request.recipeId,
        title: job.request.title,
        status: job.status,
        expiresAt: job.expiresAt,
      }
    : null;

// Uses the bridge's existing serial file transaction; never opens the inventory database.
export function cookingAction(jobs, action, data, client, now, makeId, digest) {
  if (action === 'begin') {
    const request = validateCookingRequest(data);
    const existing = jobs.find(
      (job) =>
        job.status === 'pending' ||
        (job.status === 'waiting' && job.expiresAt > now),
    );
    if (existing) {
      if (
        existing.client === client &&
        JSON.stringify(existing.request) === JSON.stringify(request)
      )
        return { ticket: cookingTaskSummary(existing) };
      fail('另一份做法仍在等待，请先完成或取消。', 409);
    }
    const job = {
      id: makeId(),
      client,
      request,
      status: 'waiting',
      createdAt: new Date(now).toISOString(),
      expiresAt: now + 30 * 60 * 1000,
    };
    jobs.push(job);
    if (jobs.length > 50) jobs.splice(0, jobs.length - 50);
    return { ticket: cookingTaskSummary(job) };
  }
  const job = jobs.find((item) => item.id === data?.ticketId);
  if (!job || (action !== 'submit' && job.client !== client))
    fail('这份做法任务不存在。', 404);
  if (action === 'cancel') {
    if (!['waiting', 'pending'].includes(job.status))
      fail('做法已经接收或取消。', 409);
    job.status = 'cancelled';
    delete job.result;
    delete job.request.ingredients;
    return { cancelled: true };
  }
  if (action === 'ack') {
    if (!['received', 'invalid', 'discarded'].includes(data.status))
      fail('做法回执无效。');
    if (job.status !== data.status && job.status !== 'pending')
      fail('做法回执已改变。', 409);
    job.status = data.status;
    delete job.result;
    delete job.request.ingredients;
    return { acknowledged: true };
  }
  if (action === 'submit') {
    if (['cancelled', 'invalid', 'discarded'].includes(job.status))
      fail('这份做法任务已取消或拒绝。', 409);
    const result = validateCookingResult(data.result, job.request),
      hash = digest(result);
    if (job.status === 'received') {
      if (job.hash !== hash) fail('同一次任务不能提交不同做法。', 409);
      return { ticketId: job.id, status: job.status, duplicate: true };
    }
    if (job.status === 'pending') {
      if (job.hash !== hash) fail('同一次任务不能提交不同做法。', 409);
      return { ticketId: job.id, status: job.status, duplicate: true };
    }
    if (job.expiresAt <= now)
      fail('这份做法请求已过期，请在页面重新开始。', 409);
    job.result = result;
    job.hash = hash;
    job.status = 'pending';
    return { ticketId: job.id, status: job.status, duplicate: false };
  }
  fail('未知做法操作。', 404);
}
