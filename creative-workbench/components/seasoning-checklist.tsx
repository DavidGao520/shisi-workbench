'use client';
import { useId, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { seasoningGroups } from '@/lib/seasonings';
import { confirmSeasoningSetup, ownedSeasonings } from '@/lib/seasoning-setup';
import { uid, type KitchenState } from '@/lib/kitchen';

export function SeasoningChecklist({
  state,
  busy,
  mutate,
  done,
  firstRun = false,
}: {
  state: KitchenState;
  busy: boolean;
  mutate: (apply: (state: KitchenState) => void) => Promise<boolean>;
  done: (added: number, skipped: boolean) => void;
  firstRun?: boolean;
}) {
  const labelId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [operationId] = useState(uid);
  const [saveError, setSaveError] = useState('');
  const owned = ownedSeasonings(state);
  const pending = selected.filter((id) => !owned.has(id));
  const common = seasoningGroups[0].items.filter((item) => !owned.has(item.id));
  const additionalCount = seasoningGroups
    .slice(1)
    .reduce((total, entry) => total + entry.items.length, 0);
  const commonSelected =
    common.length > 0 && common.every((item) => pending.includes(item.id));
  const save = async (skip: boolean) => {
    if (busy) return;
    setSaveError('');
    let added = 0;
    const saved = await mutate((current) => {
      added = confirmSeasoningSetup(current, {
        dataset: state.dataset,
        selectedIds: skip ? [] : pending,
        operationId,
        skip,
      });
    });
    if (saved) done(added, skip);
    else setSaveError('没有保存成功，选择已保留。请检查页面提示后重试。');
  };
  const group = (entry: (typeof seasoningGroups)[number]) => (
    <fieldset className="seasoning-group" disabled={busy} key={entry.id}>
      <legend>
        <span>{entry.label}</span>
        {entry.id === seasoningGroups[0].id && (
          <button
            className="text-button seasoning-shortcut"
            disabled={busy || !common.length}
            onClick={() =>
              setSelected((previous) =>
                commonSelected
                  ? previous.filter(
                      (id) => !common.some((item) => item.id === id),
                    )
                  : [...new Set([...previous, ...common.map((item) => item.id)])],
              )
            }
          >
            {commonSelected ? '取消常用项' : '选中常用 ' + common.length + ' 项'}
          </button>
        )}
      </legend>
      <div className="seasoning-grid">
        {entry.items.map((item) => {
          const existing = owned.has(item.id);
          const checked = existing || pending.includes(item.id);
          const id = labelId + '-' + item.id;
          return (
            <label
              className={
                'seasoning-option' +
                (checked ? ' is-selected' : '') +
                (existing ? ' is-owned' : '')
              }
              key={item.id}
              htmlFor={id}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={busy || existing}
                onCheckedChange={(value) =>
                  setSelected((previous) =>
                    value
                      ? [...new Set([...previous, item.id])]
                      : previous.filter((id) => id !== item.id),
                  )
                }
              />
              <span>{item.name}</span>
              {existing && <small>已记录</small>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
  return (
    <div className="seasoning-checklist">
      {group(seasoningGroups[0])}
      <details className="seasoning-more">
        <summary>
          更多酱料与香料 <span>{additionalCount} 种 · 按需选择</span>
          <ChevronRight size={17} />
        </summary>
        {seasoningGroups.slice(1).map(group)}
      </details>
      <div className="seasoning-confirm">
        <div className="actions" aria-live="polite">
          <button
            className="primary"
            disabled={busy || !pending.length}
            onClick={() => void save(false)}
          >
            <Check size={17} />
            {busy ? '正在保存…' : '确认加入 ' + pending.length + ' 种调料'}
          </button>
          {firstRun && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              暂时跳过，先录入食材
            </button>
          )}
        </div>
        {saveError && (
          <p className="warning-text" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
