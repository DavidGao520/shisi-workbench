import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const stops = [
  {
    title: '欢迎来这间有烟火气的厨房',
    text: '食材已经备好，过去做过的菜也留在百味图里。跟着逛一圈，看看从冰箱到一餐的过程。',
    next: '先看看冰箱',
  },
  {
    title: '食材都已经在冰箱里',
    text: '卡片上能看到数量和到期信息。点任意卡片，就能校准余量；改动只留在这间样例厨房。',
    next: '看看今天能做什么',
  },
  {
    title: '用手边食材，挑一道想吃的',
    text: '推荐来自这间厨房的实际库存。点一道菜看看做法；参观时不会开餐，也不会扣减食材。',
    next: '看看做菜步骤',
  },
  {
    title: '到锅边，一步一步来',
    text: '每一步都有用料、火候和完成提示。这里可以翻看步骤；正式演练才会保存做菜进度，完成复盘后再扣库存。',
    next: '去看看留下的食忆',
  },
  {
    title: '做过的菜，会留下来',
    text: '亮起的菜有样例评分和食忆，灰色的菜还等着尝试。演练完成一道新菜，就能亲手再点亮一格。',
    next: '试着做一餐',
  },
];

export function KitchenTour({
  step,
  busy,
  onStep,
  onSkip,
  onTry,
  onExit,
}: {
  step: number;
  busy: boolean;
  onStep: (step: number) => void;
  onSkip: () => void;
  onTry: () => void;
  onExit: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const stop = stops[step];
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !busy &&
        event.target instanceof Node &&
        heading.current?.parentElement?.contains(event.target)
      )
        onSkip();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [busy, onSkip]);
  if (!stop) return null;
  return (
    <aside
      className="kitchen-tour"
      aria-labelledby="tour-title"
      aria-label="样例厨房参观"
    >
      <div className="row-between">
        <span className="eyebrow">
          厨房小导览 · {step + 1} / {stops.length}
        </span>
        <button
          className="icon-button"
          onClick={onSkip}
          disabled={busy}
          aria-label="结束参观，自由逛逛"
        >
          <X size={18} />
        </button>
      </div>
      <h2 id="tour-title" ref={heading} tabIndex={-1}>
        {stop.title}
      </h2>
      <p>{stop.text}</p>
      <div className="tour-actions">
        {step > 0 && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onStep(step - 1)}
          >
            <ChevronLeft size={16} />
            上一步
          </button>
        )}
        <button
          className="primary"
          disabled={busy}
          onClick={step === stops.length - 1 ? onTry : () => onStep(step + 1)}
        >
          {stop.next}
          <ChevronRight size={16} />
        </button>
      </div>
      <button
        className="text-button tour-skip"
        disabled={busy}
        onClick={step === stops.length - 1 ? onExit : onSkip}
      >
        {step === stops.length - 1
          ? '参观完了，回到我的厨房'
          : '跳过引导，自由逛逛'}
      </button>
    </aside>
  );
}
