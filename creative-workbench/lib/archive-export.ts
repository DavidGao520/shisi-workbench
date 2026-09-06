import {
  cookingSteps,
  ingredientName,
  recipePeople,
  storedRecipe,
  safetySource,
  type Recipe,
} from './recipes';
import type { Session, Dataset } from './kitchen';
import { mealRatingSummary } from './meal-ratings';
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function renderBaiweiEntry(
  recipe: Recipe,
  session: Session,
  dataset: Dataset,
) {
  const r = storedRecipe(session) || recipe;
  if (
    session.status !== 'completed' ||
    session.recipeId !== recipe.id ||
    session.recipeId !== r.id
  )
    throw new Error('只能导出对应菜品的已完成记录。');
  if (new URL(r.source).protocol !== 'https:')
    throw new Error('来源链接必须使用 HTTPS。');
  for (const source of r.sources || [])
    if (new URL(source.url).protocol !== 'https:')
      throw new Error('来源链接必须使用 HTTPS。');
  const picture =
    session.photo &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(session.photo)
      ? '<img alt="本次成品照" src="' + session.photo + '">'
      : '';
  const html =
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>中华食肆 · 百味图</title><style>body{background:#f7f3e9;color:#493923;font:17px/1.9 system-ui;max-width:680px;margin:50px auto;padding:24px}h1,h2{font-family:serif}img{width:100%;max-height:460px;object-fit:contain;border-radius:12px}small{color:#716551}section{border-top:1px solid #d6c5ab;margin-top:28px;padding-top:20px}p{white-space:pre-wrap}a{color:#a8402e}</style><small>中华食肆 · 百味图' +
    (dataset === 'demo' ? ' · 体验样例' : '') +
    '</small><h1>' +
    escapeHtml(r.title) +
    '</h1>' +
    picture +
    '<p>' +
    escapeHtml(mealRatingSummary(session)) +
    '</p><small>' +
    escapeHtml(session.completedAt || '') +
    '</small><section><h2>我的食忆</h2><p>' +
    escapeHtml(session.familyMemory || '这一次，把一餐好好做完。') +
    '</p><small>个人记忆 · 用户自述，不作为历史事实</small></section><section><h2>家常做法的一点来处</h2><p>' +
    escapeHtml(r.knowledge) +
    '</p><a href="' +
    escapeHtml(r.source) +
    '" rel="noreferrer">' +
    (r.workbuddyVersion ? '基础配方参考：' : '做法来源：') +
    escapeHtml(r.author) +
    '</a></section>' +
    '<section><h2>本次跟做步骤</h2><small>' +
    (r.workbuddyVersion
      ? 'WorkBuddy 对话生成，经用户核对；链接是基础配方参考。'
      : '预设家庭改编，计时是估算；保留本餐开始时的做法。') +
    '</small><p>' +
    recipePeople(r, session.servings) +
    ' 人份</p><ul>' +
    r.ingredients
      .map(
        (item) =>
          '<li>' +
          escapeHtml(ingredientName(r, item.id)) +
          ' ' +
          Math.round(item.amount * session.servings * 1000) / 1000 +
          ' ' +
          escapeHtml(item.unit) +
          '</li>',
      )
      .join('') +
    '</ul><ol>' +
    cookingSteps(r, session.servings)
      .map((step) => '<li><p>' + escapeHtml(step) + '</p></li>')
      .join('') +
    '</ol>' +
    (r.safetyTips || [])
      .map((tip) => '<p>' + escapeHtml(tip) + '</p>')
      .join('') +
    '</section>' +
    (r.sources?.length
      ? '<section><h2>中文参考</h2><ul>' +
        r.sources
          .map(
            (source) =>
              '<li><a href="' +
              escapeHtml(source.url) +
              '" rel="noreferrer">' +
              escapeHtml(source.title) +
              '</a><p>' +
              escapeHtml(
                source.author +
                  ' · ' +
                  source.site +
                  ' · 核对于 ' +
                  source.accessedAt +
                  '\n' +
                  source.supports,
              ) +
              '</p></li>',
          )
          .join('') +
        '</ul><a href="' +
        safetySource +
        '" rel="noreferrer">食物安全中心：烹煮及翻热</a></section>'
      : '') +
    '<section><small>源自国宴队《中华食肆》的非游戏厨房工作台。本文件只包含这一条完成记录，不包含冰箱库存。</small></section></html>';
  return html;
}
