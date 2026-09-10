'use client';
/* oxlint-disable next/no-img-element -- Game art and local photos also run in the offline HTML. */
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  baiweiCollection,
  otherBaiweiRecords,
  savedRecipe,
  type BaiweiDish,
} from '@/lib/baiwei';
import type { KitchenState, Session } from '@/lib/kitchen';
import type { Recipe } from '@/lib/recipes';
import { mealRatingSummary } from '@/lib/meal-ratings';
import { mealRecordDate, mealRecordOrigin } from '@/lib/meal-record-origin';

type GalleryProps = {
  state: KitchenState;
  images: Record<string, string>;
  plate: string;
  onOpenRecipe: (recipe: Recipe, sessionId?: string) => void;
};

export function BaiweiDishArt({
  dish,
  src,
  plate,
  lit = false,
}: {
  dish: BaiweiDish;
  src: string;
  plate: string;
  lit?: boolean;
}) {
  return (
    <span className={'baiwei-art ' + (lit ? 'is-lit' : 'is-unlit')}>
      {!dish.selfContained && (
        <img
          className="baiwei-plate"
          src={plate}
          alt=""
          loading="lazy"
          decoding="async"
          width="256"
          height="256"
        />
      )}
      <img
        className="baiwei-food"
        style={dish.rect}
        src={src}
        alt={
          dish.name +
          (dish.assetKind === 'photo'
            ? '作者实拍'
            : dish.origin === 'workbench'
              ? '工作台插画'
              : '游戏插画')
        }
        loading="lazy"
        decoding="async"
        width="256"
        height="256"
      />
    </span>
  );
}

export function BaiweiHistory({
  history,
  sample,
  onOpenRecipe,
}: {
  history: Session[];
  sample: boolean;
  onOpenRecipe: GalleryProps['onOpenRecipe'];
}) {
  return (
    <ol className="baiwei-history">
      {history.map((session) => {
        const recipe = savedRecipe(session);
        return (
          <li
            key={session.id}
            className={session.authoredRecord ? 'is-authored' : undefined}
          >
            {session.photo && (
              <img
                className="baiwei-history-photo"
                src={session.photo}
                alt="这次制作的成品照"
                loading="lazy"
              />
            )}
            <div>
              <p className="baiwei-history-meta">
                <time
                  dateTime={
                    session.authoredRecord
                      ? session.authoredRecord.photoCapturedAt
                      : session.completedAt || session.createdAt
                  }
                >
                  {mealRecordDate(session)}
                </time>
                {!session.authoredRecord && (
                  <span>{mealRatingSummary(session)}</span>
                )}
                {sample && !session.authoredRecord && <span>样例演练</span>}
              </p>
              <p className="baiwei-memory">
                {session.familyMemory || '这一次，把一餐好好做完。'}
              </p>
              <p className="baiwei-note">{mealRecordOrigin(session)}</p>
              {recipe && (
                <button
                  className="recipe-link"
                  onClick={() =>
                    onOpenRecipe(
                      recipe,
                      session.authoredRecord ? undefined : session.id,
                    )
                  }
                >
                  {session.authoredRecord
                    ? '查看参考做法'
                    : '查看这次做法与记录'}{' '}
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function BaiweiGallery({
  state,
  images,
  plate,
  onOpenRecipe,
}: GalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = useMemo(() => baiweiCollection(state), [state]);
  const other = useMemo(() => otherBaiweiRecords(state), [state]);
  const selected = entries.find((entry) => entry.dish.id === selectedId);
  const litCount = entries.filter((entry) => entry.history.length > 0).length;
  const sample = state.dataset === 'demo';
  const openRecipe: GalleryProps['onOpenRecipe'] = (recipe, sessionId) => {
    setSelectedId(null);
    onOpenRecipe(recipe, sessionId);
  };

  return (
    <section className="baiwei-gallery" aria-label="百味图">
      <header className="baiwei-heading">
        <div className="baiwei-progress" aria-live="polite">
          <p>
            {sample ? '样例已点亮' : '已点亮'} <strong>{litCount}</strong> /{' '}
            {entries.length} 道
          </p>
          <progress
            value={litCount}
            max={entries.length}
            aria-label={sample ? '样例菜品点亮进度' : '菜品点亮进度'}
          />
          <p className="baiwei-note">
            {sample
              ? '作者实做与演练样例分开展示，不写入你的真实厨房'
              : '亲手做一道，点亮一道'}
          </p>
        </div>
      </header>
      <ul className="baiwei-list">
        {entries.map(({ dish, history }) => {
          const latest = history[0];
          return (
            <li key={dish.id} data-dish-id={dish.id} data-lit={!!latest}>
              <button
                className={
                  'baiwei-row ' +
                  (latest ? 'is-lit' : '') +
                  (latest?.authoredRecord ? ' is-authored' : '')
                }
                onClick={() => setSelectedId(dish.id)}
                aria-label={`${dish.name}，${latest ? '已点亮，' + history.length + ' 条记录' : '还没做过'}，查看故事与记录`}
              >
                <BaiweiDishArt
                  dish={dish}
                  src={images[dish.id]}
                  plate={plate}
                  lit={!!latest}
                />
                <span className="baiwei-row-content">
                  <span className="baiwei-row-title">{dish.name}</span>
                  <span className="baiwei-description">
                    {latest?.authoredRecord
                      ? '“' + latest.familyMemory + '”'
                      : dish.description}
                  </span>
                  <span className={'baiwei-status ' + (latest ? 'is-lit' : '')}>
                    {latest && <Check size={15} />}
                    {latest?.authoredRecord
                      ? '实做 · 照片与食忆'
                      : latest
                        ? `${sample ? '样例点亮' : '已点亮'} · 做过 ${history.length} 次`
                        : '还没做过'}
                  </span>
                  {latest && (
                    <span className="baiwei-note">
                      {mealRecordDate(latest)}
                      {!latest.authoredRecord &&
                        ' · ' + mealRatingSummary(latest)}
                    </span>
                  )}
                  <span className="baiwei-row-link">
                    {latest?.authoredRecord
                      ? '看实拍与食忆'
                      : latest
                        ? '翻开故事与做菜记录'
                        : '读读这道菜的故事'}{' '}
                    <ArrowUpRight size={16} />
                  </span>
                </span>
                {latest?.photo && (
                  <img
                    className="baiwei-latest-photo"
                    src={latest.photo}
                    alt={
                      latest.authoredRecord ? '作者实拍' : '最近一次的成品照'
                    }
                    loading="lazy"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {other.length > 0 && (
        <section className="baiwei-other">
          <h2>其他家常味</h2>
          <p className="baiwei-note">
            已有的做菜记录也留在这里，不计入这 {entries.length} 道的点亮进度。
          </p>
          {other.map((entry) => (
            <section key={entry.id}>
              <h3>
                {entry.title} · {entry.history.length} 次
              </h3>
              <BaiweiHistory
                history={entry.history}
                sample={sample}
                onOpenRecipe={openRecipe}
              />
            </section>
          ))}
        </section>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="kitchen-dialog baiwei-dialog"
          showCloseButton={false}
        >
          {selected && (
            <>
              <button
                className="dialog-close icon-button"
                aria-label="关闭菜品故事"
                onClick={() => setSelectedId(null)}
              >
                <X />
              </button>
              <BaiweiDishArt
                dish={selected.dish}
                src={images[selected.dish.id]}
                plate={plate}
                lit={selected.history.length > 0}
              />
              <DialogTitle>{selected.dish.name}</DialogTitle>
              <DialogDescription>{selected.dish.description}</DialogDescription>
              <section className="baiwei-story">
                <h3>这道菜的故事</h3>
                <p>{selected.dish.story}</p>
                <p className="baiwei-note">
                  {selected.dish.origin === 'workbench'
                    ? '工作台新增菜品说明 · 非游戏原作故事'
                    : '《中华食肆》游戏原作故事 · 国宴队'}
                </p>
              </section>
              {selected.recipe ? (
                <button
                  className="primary"
                  onClick={() => openRecipe(selected.recipe!)}
                >
                  查看食材与家常做法 <ArrowUpRight size={17} />
                </button>
              ) : (
                <p className="baiwei-recipe-pending">
                  家常做法还在整理中，先读故事。接入做法后，完成制作就能点亮。
                </p>
              )}
              <section>
                <h3>
                  {sample ? '做菜记录与样例' : '我的做菜记录'} ·{' '}
                  {selected.history.length} 条
                </h3>
                {selected.history.length > 0 && (
                  <BaiweiHistory
                    history={selected.history}
                    sample={sample}
                    onOpenRecipe={openRecipe}
                  />
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
