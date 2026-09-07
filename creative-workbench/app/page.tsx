'use client';
/* oxlint-disable next/no-img-element -- Embedded game artwork and local photos must work in the standalone HTML without an image server. */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ChefHat,
  Refrigerator,
  BookOpen,
  CookingPot,
  Plus,
  ArrowUpRight,
  Leaf,
  Camera,
  Mic,
  Download,
  Clock3,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Pause,
  Play,
  Search,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SeasoningChecklist } from '@/components/seasoning-checklist';
import { VoiceIntake } from '@/components/voice-intake';
import { MealIngredients } from '@/components/meal-ingredients';
import { MealRatingInput } from '@/components/meal-rating-input';
import {
  hasCompleteMealRatings,
  mealRatingsDraft,
  mealRatingSummary,
} from '@/lib/meal-ratings';
import { BaiweiGallery, BaiweiDishArt } from '@/components/baiwei-gallery';
import {
  RecipeDetailSections,
  RecipeInstructions,
} from '@/components/recipe-instructions';
import { baiweiCollection, baiweiDishes } from '@/lib/baiwei';
import { KitchenTour } from '@/components/kitchen-tour';
import {
  openDemoKitchen,
  restoreDemoKitchen,
  saveTourStep,
  tourPages,
} from '@/lib/demo-kitchen';
import '@/components/baiwei-gallery.css';
import '@/components/recipe-instructions.css';
import { baiweiImages, baiweiPlate } from '@/lib/baiwei-art';
import { needsSeasoningOnboarding } from '@/lib/seasoning-setup';
import { Progress } from '@/components/ui/progress';
import { KitchenIngredientCard } from '@/components/kitchen-ingredient-card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { IndexedDbStore } from '@/lib/store';
import {
  candidateReview,
  confirmReviewedCandidate,
  stageInventoryEditCandidate,
} from '@/lib/candidate-review';
import {
  BRIDGE_URL,
  databaseName,
  stageDelivery,
} from '@/lib/workbuddy-bridge';
import { useWorkBuddyBridge } from '@/lib/use-workbuddy-bridge';
import { useWorkBuddyCooking } from '@/lib/use-workbuddy-cooking';
import {
  receiveCookingSteps,
  ignoreCookingTicket,
} from '@/lib/workbuddy-cooking';
import { sessionRecipe, detailRecipe } from '@/lib/kitchen';
import { renderBaiweiEntry } from '@/lib/archive-export';
import {
  names,
  recipes,
  detailedCookingSteps,
  recipePeople,
  RECIPE_VERSION,
  type Recipe,
} from '@/lib/recipes';
import { art, getPantryCardArt } from '@/lib/art';
import {
  activeSession,
  bands,
  finishCooking,
  confirmCandidate,
  DEFAULT_SERVINGS,
  isExpired,
  mealIngredients,
  parseImport,
  quantityText,
  recommendations,
  rejectCandidate,
  stage,
  startCooking,
  stepSession,
  uid,
  units,
  type Batch,
  type Candidate,
  type Dataset,
  type KitchenState,
  type Mode,
  type MealConfirmation,
  type Session,
} from '@/lib/kitchen';

const db = new IndexedDbStore(databaseName());

function RecipeArt({ recipe }: { recipe: Recipe }) {
  const dish = baiweiDishes.find((dish) => dish.id === recipe.id);
  return dish ? (
    <BaiweiDishArt
      dish={dish}
      src={baiweiImages[dish.id]}
      plate={baiweiPlate}
      lit
    />
  ) : (
    <img src={art[recipe.image]} alt={recipe.title + '游戏插画'} />
  );
}
const pages = [
  { id: 'today', name: '今日一餐', icon: CookingPot },
  { id: 'inventory', name: '我的厨房', icon: Refrigerator },
  { id: 'cooking', name: '做菜模式', icon: ChefHat },
  { id: 'archive', name: '百味图', icon: BookOpen },
];
type ChoiceOption = { value: string; label: string };
function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label id={id}>{label}</label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          if (v !== null) onChange(String(v));
        }}
      >
        <SelectTrigger aria-labelledby={id} className="choice-trigger">
          <SelectValue>
            {options.find((o) => o.value === value)?.label || '请选择'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Tick({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="tick" htmlFor={id}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(!!v)}
      />
      <span>{label}</span>
    </label>
  );
}
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportEntry(r: Recipe, session: Session, dataset: Dataset) {
  download(
    '中华食肆-百味图-' + r.title + '.html',
    renderBaiweiEntry(r, session, dataset),
    'text/html',
  );
}
async function photoData(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error('请上传 12 MB 以内的 JPG、PNG 或 WebP 照片。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('照片处理失败，请换一张或跳过照片。');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
type Mutate = (
  fn: (s: KitchenState) => void,
  message?: string,
) => Promise<boolean>;
function CandidateEditor({
  candidate: c,
  s,
  busy,
  mutate,
  variant = 'candidate',
  onResolved,
}: {
  candidate: Candidate;
  s: KitchenState;
  busy: boolean;
  mutate: Mutate;
  variant?: 'candidate' | 'calibration';
  onResolved?: () => void;
}) {
  const isCalibration = variant === 'calibration';
  const latestReview = candidateReview(s, c);
  const [review, setReview] = useState(() => latestReview);
  const stale = latestReview.fingerprint !== review.fingerprint;
  const [amount, setAmount] = useState(
    review.quantity.amount === undefined ? '' : String(review.quantity.amount),
  );
  const [unit, setUnit] = useState(review.quantity.unit || '克');
  const [kind, setKind] = useState(
    review.quantity.amountBand ? 'band' : 'exact',
  );
  const [band, setBand] = useState(review.quantity.amountBand || '少量');
  const [expiry, setExpiry] = useState(review.expiryDate || '');
  const hasCardArt = !!getPantryCardArt(review.ingredientId, review.name);
  const previewQuantity =
    kind === 'exact'
      ? amount === ''
        ? '数量待确认'
        : quantityText({ amount: Number(amount), unit })
      : band;
  const visibleWarnings = c.warnings.filter(
    (warning) =>
      ![
        '请人工选择对应食材，或选「其他食材」。',
        '请在下方选择原批次进行盘点校准。',
      ].includes(warning),
  );
  return (
    <article
      className={`candidate${hasCardArt && !isCalibration ? ' candidate-with-art' : ''}${isCalibration ? ' candidate--calibration' : ''}`}
    >
      {hasCardArt && !isCalibration && (
        <KitchenIngredientCard
          ingredientId={review.ingredientId}
          name={review.name}
          status="pending"
          quantity={previewQuantity}
          expiryDate={expiry || undefined}
        />
      )}
      <div className="candidate-editor-body">
        {!isCalibration && (
          <div className="row-between">
            <h3>{review.name}</h3>
            <span className="tag amber">
              待确认 · {c.mode === 'stocktake' ? '盘点' : '补货'}
            </span>
          </div>
        )}
        {c.rawMention && <p className="muted">原始提及：{c.rawMention}</p>}
        <div className="form-grid stocktake-fields">
          <Choice
            label="数量形式"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'exact', label: '精确数量' },
              { value: 'band', label: '数量不确定' },
            ]}
          />
          {kind === 'exact' ? (
            <div className="quantity-pair">
              <label className="field">
                数量
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <Choice
                label="单位"
                value={unit}
                onChange={setUnit}
                options={units.map((v) => ({ value: v, label: v }))}
              />
            </div>
          ) : (
            <Choice
              label="数量档"
              value={band}
              onChange={setBand}
              options={bands.map((v) => ({ value: v, label: v }))}
            />
          )}
          <label className="field">
            到期日期（不知道可留空）
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
        </div>
        {review.problem && <p className="warning-text">{review.problem}</p>}
        {stale && (
          <p className="warning-text">
            库存有更新，请重新核对。
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setReview(latestReview);
                setAmount(
                  latestReview.quantity.amount === undefined
                    ? ''
                    : String(latestReview.quantity.amount),
                );
                setUnit(latestReview.quantity.unit || '克');
                setKind(latestReview.quantity.amountBand ? 'band' : 'exact');
                setBand(latestReview.quantity.amountBand || '少量');
                setExpiry(latestReview.expiryDate || '');
              }}
            >
              重新核对
            </button>
          </p>
        )}
        {visibleWarnings.length > 0 && (
          <p className="warning-text">{visibleWarnings.join('；')}</p>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={
              busy ||
              stale ||
              !!review.problem ||
              (kind === 'exact' && amount === '')
            }
            onClick={async () => {
              const saved = await mutate(
                (state) =>
                  confirmReviewedCandidate(state, c.key, review, {
                    quantity:
                      kind === 'exact'
                        ? { amount: Number(amount), unit }
                        : { amountBand: band },
                    expiryDate: expiry || undefined,
                  }),
                isCalibration ? '库存信息已更新。' : '已确认入库。',
              );
              if (saved) onResolved?.();
            }}
          >
            <Check size={17} />
            {isCalibration ? '保存校准' : '确认这一项'}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              const saved = await mutate(
                (state) => rejectCandidate(state, c.key),
                isCalibration
                  ? '已取消校准，原库存保持不变。'
                  : '已拒绝，不会进入库存。',
              );
              if (saved) onResolved?.();
            }}
          >
            {isCalibration ? '取消校准' : '不记录这项'}
          </button>
        </div>
      </div>
    </article>
  );
}
function ReviewForm({
  session,
  busy,
  mutate,
  done,
  onError,
}: {
  session: Session;
  busy: boolean;
  mutate: Mutate;
  done: () => void;
  onError: (v: string) => void;
}) {
  const [ratings, setRatings] = useState(() =>
      mealRatingsDraft(session.reviewDraft?.ratings),
    ),
    [memory, setMemory] = useState(session.reviewDraft?.memory || ''),
    [photo, setPhoto] = useState(session.reviewDraft?.photo || ''),
    [photoBusy, setPhotoBusy] = useState(false);
  const ratingsComplete = hasCompleteMealRatings(ratings);
  return (
    <section className="paper review-form">
      <p className="eyebrow">掌柜复盘</p>
      <h2>这一餐，做得怎么样？</h2>
      <div className="review-fields">
        <label className="photo-upload">
          <Camera />
          <span>{photo ? '更换成品照' : '留张成品照（可跳过）'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || photoBusy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setPhotoBusy(true);
              try {
                setPhoto(await photoData(f));
              } catch (err) {
                onError(String((err as Error).message));
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
        </label>
        {photo && (
          <>
            <img className="review-photo" src={photo} alt="本次成品照预览" />
            <button className="text-button" onClick={() => setPhoto('')}>
              移除照片
            </button>
          </>
        )}
        <MealRatingInput
          value={ratings}
          onChange={setRatings}
          disabled={busy || photoBusy}
        />
        <label className="field">
          留一句家庭记忆或下次改进（可选）
          <textarea
            value={memory}
            maxLength={2000}
            onChange={(e) => setMemory(e.target.value)}
            placeholder="比如：这一口，像小时候家里的晚饭。"
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || photoBusy || !ratingsComplete}
          onClick={async () => {
            if (busy || photoBusy || !ratingsComplete) return;
            if (
              await mutate(
                (state) =>
                  finishCooking(state, session.id, {
                    ratings,
                    memory,
                    photo: photo || undefined,
                  }),
                '这一餐已收录百味图。',
              )
            )
              done();
          }}
        >
          完成，收录百味图
          <ArrowUpRight size={17} />
        </button>
        <button
          className="secondary"
          disabled={busy || photoBusy}
          onClick={() =>
            mutate((state) => {
              const v = activeSession(state);
              if (v?.id === session.id)
                v.reviewDraft = {
                  ratings,
                  ...(v.reviewDraft?.rating !== undefined
                    ? { rating: v.reviewDraft.rating }
                    : {}),
                  memory,
                  photo: photo || undefined,
                  // Preserve old draft data without using its manual stock edits.
                  ...(v.reviewDraft?.consumption
                    ? { consumption: v.reviewDraft.consumption }
                    : {}),
                };
            }, '复盘草稿已保存，下次可以继续。')
          }
        >
          保存草稿
        </button>
      </div>
    </section>
  );
}
export default function Home() {
  const [page, setPage] = useState('today'),
    [dataset, setDataset] = useState<Dataset>('real'),
    [s, setState] = useState<KitchenState>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [tourPaused, setTourPaused] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const savedTourStep =
    dataset === 'demo' && s?.dataset === 'demo' && !tourPaused
      ? (s.demoExperience?.tourStep ?? null)
      : null;
  const tourStep =
    savedTourStep !== null && page === tourPages[savedTourStep]
      ? savedTourStep
      : null;
  const tourRecipe =
    recipes.find((r) => r.id === s?.demoExperience?.recipeId) ||
    recipes.find((r) => r.id === 'braised_pork')!;
  // Manual navigation dismisses old feedback; successful workflows keep their
  // newly created notice when they move to the destination with setPage.
  const navigate = useCallback((nextPage: string) => {
    setMessage('');
    setTourPaused(true);
    setPage(nextPage);
  }, []);
  const lock = useRef(false),
    datasetRef = useRef<Dataset>('real');
  const [dialog, setDialog] = useState<'manual' | 'workbuddy' | 'voice' | null>(
      null,
    ),
    [detail, setDetail] = useState<{
      recipeId: string;
      sessionId?: string;
    } | null>(null),
    [reset, setReset] = useState(false),
    [clear, setClear] = useState(false);
  const [calibrationKey, setCalibrationKey] = useState<string | null>(null);
  const [seasoningOpen, setSeasoningOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('stocktake'),
    [manualName, setManualName] = useState('番茄'),
    [manualAmount, setManualAmount] = useState(''),
    [manualUnit, setManualUnit] = useState('克');
  const [search, setSearch] = useState(''),
    [foodCheckVersion, setFoodChecked] = useState('');
  const [mealConfirmations, setMealConfirmations] = useState<
    MealConfirmation[]
  >([]);
  const [now, setNow] = useState(() => Date.now());
  const reload = useCallback(async (d: Dataset) => {
    try {
      const data = await (d === 'demo' ? openDemoKitchen(db) : db.read(d));
      if (datasetRef.current === d)
        setState((previous) =>
          previous?.dataset === d && previous.revision > data.revision
            ? previous
            : data,
        );
    } catch (e) {
      if (datasetRef.current === d)
        setError('本机保存不可用：' + (e as Error).message);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (dataset === 'demo' ? openDemoKitchen(db) : db.read(dataset)).then(
      (data) => {
        if (!cancelled)
          setState((previous) =>
            previous?.dataset === dataset && previous.revision > data.revision
              ? previous
              : data,
          );
      },
      (reason) => {
        if (!cancelled) setError('本机保存不可用：' + String(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataset]);
  useEffect(() => {
    if (tourStep === null || page !== tourPages[tourStep]) return;
    document
      .getElementById('tour-stop-' + tourStep)
      ?.scrollIntoView({ block: 'start' });
  }, [page, tourStep]);
  useEffect(() => {
    const refresh = () => void reload(datasetRef.current);
    window.addEventListener('focus', refresh);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('focus', refresh);
      clearInterval(t);
    };
  }, [reload]);
  const mutate: Mutate = async (fn, msg) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    const current = datasetRef.current;
    try {
      const result = await db.change(current, fn);
      if (datasetRef.current === current) {
        setState(result);
        if (msg) setMessage(msg);
      }
      return datasetRef.current === current;
    } catch (e) {
      setError((e as Error).message || '保存失败，未显示为成功。');
      await reload(current);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const bridge = useWorkBuddyBridge({
    dataset,
    notify: setMessage,
    receive: async (entry) => {
      if (datasetRef.current !== entry.envelope.dataset || lock.current)
        return false;
      let added = 0;
      const saved = await mutate((state) => {
        added = stageDelivery(state, entry);
      });
      if (saved && added > 0)
        setMessage('WorkBuddy 识别结果已到候选区，请核对后入库。');
      if (saved && added > 0 && dialog === 'workbuddy') {
        setDialog(null);
        setPage('inventory');
      }
      return saved;
    },
  });
  const cooking = useWorkBuddyCooking({
    dataset,
    notify: setMessage,
    ignore: async (ticket) => {
      if (datasetRef.current !== ticket.dataset || lock.current) return false;
      return mutate((state) => ignoreCookingTicket(state, ticket));
    },
    receive: async (entry) => {
      if (datasetRef.current !== entry.request.dataset || lock.current)
        return false;
      let added = false;
      const saved = await mutate((state) => {
        added = receiveCookingSteps(state, entry);
      });
      if (saved && added) {
        setFoodChecked('');
        setMessage(
          'WorkBuddy 的做法已到，请查看步骤并核对后开始。库存没有扣减。',
        );
      }
      return saved;
    },
  });
  // Progressive enhancement only: navigation changes the same visible tab; never grants inventory write access.
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'open_kitchen_view',
            description:
              'Open a visible kitchen view. Does not read private inventory or confirm writes.',
            inputSchema: {
              type: 'object',
              properties: {
                view: { type: 'string', enum: pages.map((p) => p.id) },
              },
              required: ['view'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              const v = input as { view?: unknown };
              if (
                !v ||
                Object.keys(v).some((k) => k !== 'view') ||
                !pages.some((p) => p.id === v.view)
              )
                throw new Error('Invalid view');
              navigate(String(v.view));
              return { opened: v.view };
            },
          },
          { signal: abort.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Unsupported optional registry does not block local UI. */
    }
    return () => abort.abort();
  }, [navigate]);
  const session = s ? activeSession(s) : undefined,
    rec = s ? recommendations(s) : [];
  const recipe =
    detail && s
      ? detailRecipe(s, detail.recipeId, detail.sessionId)
      : undefined;
  const detailServings = detail?.sessionId
    ? s?.sessions.find((item) => item.id === detail.sessionId)?.servings ||
      DEFAULT_SERVINGS
    : DEFAULT_SERVINGS;
  const sessionDish = s && session ? sessionRecipe(s, session) : undefined;
  const currentStep =
    sessionDish && session
      ? detailedCookingSteps(sessionDish, session.servings)?.[session.step]
      : undefined;
  const openRecipe = (r: Recipe, sessionId?: string) => {
    if (tourStep === 2 && !sessionId) {
      void moveTour(3, r.id);
      return;
    }
    setDetail({ recipeId: r.id, sessionId });
    setFoodChecked('');
    setMealConfirmations([]);
  };
  const closeRecipe = () => {
    setDetail(null);
    setMealConfirmations([]);
    setFoodChecked('');
  };
  const ingredientRows =
    s && recipe
      ? mealIngredients(s, recipe, mealConfirmations, undefined, detailServings)
      : [];
  const checkKey = recipe
    ? JSON.stringify(ingredientRows.map((i) => [i.token, i.confirmed]))
    : '';
  const foodChecked = !!checkKey && foodCheckVersion === checkKey;
  const pending = s?.candidates.filter((c) => c.status === 'pending') || [];
  const calibrationCandidate = calibrationKey
    ? pending.find((candidate) => candidate.key === calibrationKey)
    : undefined;
  const moveTour = async (step: number | null, recipeId?: string) => {
    if (await mutate((state) => saveTourStep(state, step, recipeId))) {
      setTourPaused(false);
      setPreviewStep(0);
      closeRecipe();
      if (step !== null) setPage(tourPages[step]);
    }
  };
  const confirmSample = () =>
    mutate((state) => {
      for (const c of state.candidates.filter(
        (c) => c.status === 'pending' && c.source === 'demo',
      ))
        confirmCandidate(state, c.key, {
          name: c.displayName,
          ingredientId: c.canonicalIngredientId!,
          quantity: { amount: c.amount, unit: c.unit },
        });
    }, '样例食材已由你确认，可以查看三道推荐。');
  const inventoryUsed =
    s?.inventory.filter((b) =>
      b.amount === undefined ? b.amountBand !== '用完' : b.amount > 0,
    ).length || 0;
  const showSeasoningSetup =
    !!s &&
    needsSeasoningOnboarding(s) &&
    (page === 'today' || page === 'inventory');
  const finishSeasonings = (added: number, skipped: boolean) => {
    setSeasoningOpen(false);
    setPage('inventory');
    setMessage(
      skipped
        ? '已跳过调料设置。以后可在“我的厨房”打开调料清单。'
        : added + ' 种调料已记录。其他食材可以用语音或拍照录入。',
    );
  };
  const calibrateBatch = async (b: Batch) => {
    let candidateKey = '';
    const saved = await mutate((state) => {
      candidateKey = stageInventoryEditCandidate(state, b.id).key;
    }, '请核对数量形式、数量和到期日期。');
    if (saved && candidateKey) setCalibrationKey(candidateKey);
  };
  const changeDataset = async (d: Dataset) => {
    if (!busy && !lock.current) {
      // Keep bridge deliveries on the old dataset until the target is fully
      // hydrated. No poll may treat a half-initialized demo as an old kitchen.
      lock.current = true;
      setBusy(true);
      try {
        const data = await (d === 'demo' ? openDemoKitchen(db) : db.read(d));
        setState(data);
        setError('');
        setMessage('');
        setDialog(null);
        setDetail(null);
        setMealConfirmations([]);
        setFoodChecked('');
        setSeasoningOpen(false);
        setCalibrationKey(null);
        setTourPaused(false);
        setPreviewStep(0);
        datasetRef.current = d;
        setDataset(d);
        setPage(
          d === 'demo' && data.demoExperience?.tourStep != null
            ? tourPages[data.demoExperience.tourStep]
            : 'today',
        );
      } catch (reason) {
        setError('厨房未切换：' + (reason as Error).message);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Tabs
      value={page}
      onValueChange={(v) => navigate(String(v))}
      orientation="vertical"
      className={'kitchen-app' + (tourStep !== null ? ' has-kitchen-tour' : '')}
      style={{ display: 'block' }}
    >
      <aside className="rail">
        <div className="brand">
          <span className="brand-seal">食</span>
          <div>食肆工作台</div>
        </div>
        <TabsList className="side-tabs">
          {pages.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              <p.icon />
              {p.name}
              {p.id === 'inventory' && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="rail-note">
          <Leaf size={25} />
          <p>
            从游戏的一餐
            <br />
            到生活的一餐
          </p>
          <small>国宴队 · 中华食肆</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            {dataset === 'demo' ? '体验样例厨房' : '我的家庭厨房'}{' '}
            <span className="dot" />
            {s ? '本机保存' : '正在打开本机数据库'}
          </span>
          <div className="actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                changeDataset(dataset === 'real' ? 'demo' : 'real')
              }
            >
              {dataset === 'real' ? '先逛逛样例厨房' : '返回我的真实厨房'}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        {dataset === 'demo' && (
          <div className="dataset-banner">
            <strong>体验样例</strong>
            <span>食材与食忆均为样例，不影响真实厨房。</span>
            <button
              className="text-button"
              disabled={busy || !s}
              onClick={() =>
                void moveTour(
                  tourPaused ? (s?.demoExperience?.tourStep ?? 0) : 0,
                )
              }
            >
              {tourPaused && s?.demoExperience?.tourStep !== null
                ? '继续参观'
                : '重新参观'}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setReset(true)}
            >
              <RotateCcw size={14} />
              恢复初始样例
            </button>
          </div>
        )}
        <div className="intro">
          <div>
            <p className="eyebrow">
              {dataset === 'demo'
                ? '练习做一餐，不必真的开火'
                : '从手边食材开始'}
            </p>
            <h1>{pages.find((p) => p.id === page)?.name}</h1>
            {page !== 'cooking' && (
              <p>
                {page === 'today'
                  ? '冰箱有啥，今天吃啥。挑一道手边就能做的家常菜。'
                  : page === 'inventory'
                    ? '先确认，再入库。每一批食材，都由你说了算。'
                    : '在游戏里收集味道，在生活里留住食忆。'}
              </p>
            )}
          </div>
        </div>
        {error && (
          <div role="alert" className="notice error">
            <span>{error}</span>
            <button
              className="text-button"
              onClick={() => {
                setError('');
                void reload(dataset);
              }}
            >
              重新读取
            </button>
          </div>
        )}
        {message && (
          <output className="notice" aria-live="polite">
            <span>{message}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setMessage('')}
            >
              <X size={16} />
            </button>
          </output>
        )}
        {!s ? (
          <section className="paper">
            <h2>正在打开你的厨房</h2>
            <p>若当前承载环境拒绝本地存储，会显示错误，不会另建一套库存。</p>
          </section>
        ) : (
          <>
            {showSeasoningSetup && (
              <section
                className="paper seasoning-onboarding"
                aria-labelledby="seasoning-welcome"
              >
                <h2 id="seasoning-welcome">先备好调料</h2>
                <p>先勾选调料，再用语音或拍照录入冰箱里的其他食材。</p>
                <SeasoningChecklist
                  key={dataset}
                  state={s}
                  busy={busy}
                  mutate={mutate}
                  done={finishSeasonings}
                  firstRun
                />
              </section>
            )}
            <TabsContent value="today">
              {session && (
                <div className="resume-strip">
                  <CookingPot />
                  <span>
                    还有一餐 {sessionRecipe(s, session).title}{' '}
                    未完成，已保存当前进度。
                  </span>
                  <button
                    className="secondary"
                    onClick={() => navigate('cooking')}
                  >
                    继续这一餐
                  </button>
                </div>
              )}
              {dataset === 'demo' && (
                <section
                  id="tour-stop-0"
                  className={
                    'start-panel demo-welcome' +
                    (tourStep === 0 ? ' tour-target' : '')
                  }
                >
                  <div>
                    <p className="eyebrow">打开冰箱，就能开始</p>
                    <h2>这间厨房，已经有了些烟火气</h2>
                    <p>
                      {inventoryUsed} 项食材和调料 · 百味图已点亮{' '}
                      {
                        baiweiCollection(s).filter(
                          (entry) => entry.history.length,
                        ).length
                      }{' '}
                      / {baiweiDishes.length} 道
                    </p>
                    <p className="muted">
                      随便逛，也可以试着做一餐。所有变化都只留在样例厨房。
                    </p>
                    {!s.sessions.some((record) => record.sampleRecord) && (
                      <p>
                        已保留你原来的样例内容。想体验备好 22
                        项食材的版本，可点上方“恢复初始样例”。
                      </p>
                    )}
                    {s.inventory.some((batch) => isExpired(batch)) && (
                      <p>
                        部分样例食材已过期，推荐会随库存变化。恢复初始样例可重新备齐今天的三道菜。
                      </p>
                    )}
                  </div>
                  {tourStep === null && (
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void moveTour(s.demoExperience?.tourStep ?? 0)
                        }
                      >
                        {s.demoExperience?.tourStep != null
                          ? '继续参观厨房'
                          : '带我逛逛厨房'}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => navigate('inventory')}
                      >
                        去看看冰箱
                      </button>
                    </div>
                  )}
                </section>
              )}
              {dataset === 'real' && !showSeasoningSetup && (
                <section className="start-panel">
                  <div>
                    <p className="eyebrow">
                      {inventoryUsed
                        ? '厨房里，已有 ' + inventoryUsed + ' 批食材'
                        : '你的冰箱，还没开始记录'}
                    </p>
                    <h2>
                      {inventoryUsed
                        ? '用手边的，做一顿好的'
                        : '先把食材摆上桌'}
                    </h2>
                    <p>
                      {inventoryUsed
                        ? '只有确认过的食材才会出现在推荐里。'
                        : '食材、油盐和饮用水都需要确认，不会默认你已经拥有。'}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => {
                        navigate('inventory');
                        setDialog('voice');
                      }}
                    >
                      <Mic size={18} />
                      语音录入食材
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        navigate('inventory');
                        setDialog('workbuddy');
                      }}
                    >
                      <Camera size={18} />
                      拍照录入食材
                    </button>
                  </div>
                </section>
              )}
              {dataset === 'real' &&
                !s.seasoningSetup &&
                !showSeasoningSetup && (
                  <div className="seasoning-invitation paper">
                    <div>
                      <h3>把常用调料也记上</h3>
                      <p>油盐酱醋直接勾选，不用拍照；已有记录不会重复添加。</p>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setSeasoningOpen(true)}
                    >
                      打开调料清单
                    </button>
                  </div>
                )}
              <div
                id="tour-stop-2"
                className={
                  'section-head' + (tourStep === 2 ? ' tour-target' : '')
                }
              >
                <h2>手边食材，能做这些</h2>
                <span>规则推荐 · 最多三道</span>
              </div>
              {!rec.length ? (
                <div className="empty-state">
                  <CookingPot size={34} />
                  <h3>
                    {inventoryUsed
                      ? '暂时没有符合条件的推荐'
                      : '先确认食材，再给你推荐'}
                  </h3>
                  <p>
                    核对现有食材和数量，就能找到适合的一餐。已勾选的调料仍需确认用量。
                  </p>
                  <button
                    className="secondary"
                    onClick={() => navigate('inventory')}
                  >
                    去我的厨房
                  </button>
                </div>
              ) : (
                <div className="recipe-grid">
                  {rec.map(({ recipe: r, matches, missing }) => (
                    <article className="recipe-card" key={r.id}>
                      <button
                        className="dish-cover image-button"
                        onClick={() => openRecipe(r)}
                        aria-label={'查看' + r.title}
                      >
                        <RecipeArt recipe={r} />
                        <span
                          className={
                            'dish-badge ' + (missing.length ? 'amber' : '')
                          }
                        >
                          {missing.length ? '还需确认食材' : '食材已齐'}
                        </span>
                      </button>
                      <div className="recipe-body">
                        <p className="eyebrow">
                          预设家常做法 · 约 {r.minutes} 分钟
                        </p>
                        <h2>{r.title}</h2>
                        <p>{r.subtitle}</p>
                        <div className="match-note">
                          {matches
                            .filter((m) => m.enough)
                            .map((m) => names[m.id])
                            .join(' · ') || '暂无足量匹配'}
                        </div>
                        {missing.length > 0 && (
                          <p className="warning-text">
                            还缺 / 待确认：
                            {missing
                              .map(
                                (m) =>
                                  (m.presenceOnly
                                    ? names[m.id] + '已备，核对 '
                                    : names[m.id] + ' ') +
                                  Math.max(0, m.need - m.have) +
                                  ' ' +
                                  m.unit,
                              )
                              .join('、')}
                          </p>
                        )}
                        <button
                          className="recipe-link"
                          onClick={() => openRecipe(r)}
                        >
                          跟着做这道菜
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="section-head">
                <h2>按菜名找做法</h2>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="搜索菜名"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="菜名，如番茄"
                  />
                </label>
              </div>
              <div className="recipe-index">
                {recipes
                  .filter(
                    (r) =>
                      r.title.includes(search) ||
                      (search === '番茄' && r.id === 'tomato_egg'),
                  )
                  .map((r) => (
                    <button
                      className="index-item"
                      key={r.id}
                      onClick={() => openRecipe(r)}
                    >
                      <RecipeArt recipe={r} />
                      <div>
                        <strong>{r.title}</strong>
                        <small>预设家常做法 · 约 {r.minutes} 分钟</small>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))}
              </div>
            </TabsContent>
            <TabsContent value="inventory">
              <div className="inventory-tools">
                <div className="actions">
                  <button
                    className={dataset === 'demo' ? 'secondary' : 'primary'}
                    onClick={() => setDialog('voice')}
                  >
                    <Mic size={17} />
                    语音录入
                  </button>
                  <button
                    className={dataset === 'demo' ? 'secondary' : 'primary'}
                    onClick={() => setDialog('workbuddy')}
                  >
                    <Camera size={17} />
                    拍照识别
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setDialog('manual')}
                  >
                    <Plus size={17} />
                    手动补充
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setDialog(null);
                      setSeasoningOpen(true);
                    }}
                  >
                    <Check size={17} />
                    调料清单
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    download(
                      '中华食肆-' + dataset + '-备份.json',
                      JSON.stringify(
                        {
                          format: 'zhonghua-shisi-backup',
                          version: 1,
                          exportedAt: new Date().toISOString(),
                          state: s,
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Download size={16} />
                  完整备份
                </button>
              </div>
              {pending.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>桌上还有 {pending.length} 项，等你确认</h2>
                    {dataset === 'demo' &&
                      pending.some((c) => c.source === 'demo') && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={confirmSample}
                        >
                          确认全部样例食材
                        </button>
                      )}
                  </div>
                  <div className="candidate-list">
                    {pending.map((c) => (
                      <CandidateEditor
                        key={c.key}
                        candidate={c}
                        s={s}
                        busy={busy}
                        mutate={mutate}
                      />
                    ))}
                  </div>
                </>
              )}
              <div
                id="tour-stop-1"
                className={
                  'section-head' + (tourStep === 1 ? ' tour-target' : '')
                }
              >
                <h2>已确认的厨房库存</h2>
              </div>
              {!s.inventory.length ? (
                <div className="empty-state">
                  <Refrigerator size={34} />
                  <h3>冰箱还空着</h3>
                  <p>
                    从一两个你确定有的食材开始。照片识别结果也要先经过你的确认。
                  </p>
                </div>
              ) : (
                <div className="inventory-grid">
                  {s.inventory.map((b) =>
                    getPantryCardArt(b.canonicalIngredientId, b.displayName) ? (
                      <KitchenIngredientCard
                        key={b.id}
                        ingredientId={b.canonicalIngredientId}
                        name={b.displayName}
                        status="confirmed"
                        quantity={quantityText(b)}
                        expiryDate={b.expiryDate}
                        expired={isExpired(b)}
                        triggerLabel={`打开${b.displayName}的数量形式、数量和到期日期校准`}
                        triggerDisabled={busy}
                        onTrigger={() => void calibrateBatch(b)}
                      />
                    ) : (
                      <article
                        className={
                          'inventory-item ' + (isExpired(b) ? 'expired' : '')
                        }
                        key={b.id}
                      >
                        <div className="row-between">
                          <h3>{b.displayName}</h3>
                          <span className="ingredient-mark">
                            {b.displayName.slice(0, 1)}
                          </span>
                        </div>
                        <p className="inventory-amount">{quantityText(b)}</p>
                        <small>
                          {isExpired(b)
                            ? '已过期 · 不计入推荐'
                            : b.expiryDate
                              ? '到期 ' + b.expiryDate
                              : '未记录到期日期 · 不代表新鲜度'}
                        </small>
                        <button
                          type="button"
                          className="inventory-item__trigger"
                          aria-label={`校准${b.displayName}：当前${quantityText(b)}，${b.expiryDate ? `到期${b.expiryDate}` : '未记录到期日期'}。填写数量形式、数量和到期日期`}
                          disabled={busy}
                          onClick={() => void calibrateBatch(b)}
                        />
                      </article>
                    ),
                  )}
                </div>
              )}
              <div className="actions bottom-actions">
                <button className="primary" onClick={() => navigate('today')}>
                  看看今天吃什么
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => setClear(true)}
                >
                  清空当前厨房库存
                </button>
              </div>
            </TabsContent>
            <TabsContent value="cooking">
              {tourStep === 3 ? (
                <section
                  id="tour-stop-3"
                  className="cooking-layout tour-target"
                >
                  <div className="cooking-art">
                    <RecipeArt recipe={tourRecipe} />
                    <p className="eyebrow">跟做预览 · 尚未开始演练</p>
                    <h2>{tourRecipe.title}</h2>
                    <p>
                      仅翻看做法，不开启计时、不扣减库存，也不改变正在进行的一餐。
                    </p>
                  </div>
                  <div className="paper step-panel">
                    <p className="eyebrow">
                      预览第 {previewStep + 1} / {tourRecipe.steps.length} 步
                    </p>
                    <RecipeInstructions
                      recipe={tourRecipe}
                      stepIndex={previewStep}
                    />
                    <div className="actions">
                      <button
                        className="secondary"
                        disabled={previewStep === 0}
                        onClick={() => setPreviewStep((value) => value - 1)}
                      >
                        上一步预览
                      </button>
                      <button
                        className="secondary"
                        disabled={previewStep === tourRecipe.steps.length - 1}
                        onClick={() => setPreviewStep((value) => value + 1)}
                      >
                        下一步预览
                      </button>
                    </div>
                  </div>
                </section>
              ) : !session ? (
                <div className="empty-state">
                  <ChefHat size={40} />
                  <h2>今天，想做哪一道？</h2>
                  <p>先选一道菜，确认食材和做法，再一步一步跟着做。</p>
                  <button className="primary" onClick={() => navigate('today')}>
                    去选一道菜
                  </button>
                </div>
              ) : session.status === 'reviewing' ? (
                <ReviewForm
                  key={session.id}
                  session={session}
                  busy={busy}
                  mutate={mutate}
                  done={() => setPage('archive')}
                  onError={setError}
                />
              ) : (
                <section className="cooking-layout">
                  <div className="cooking-art">
                    <RecipeArt recipe={sessionRecipe(s, session)} />
                    <p className="eyebrow">
                      {dataset === 'demo'
                        ? '体验演练 · 无需真的开火'
                        : '已确认的一餐'}{' '}
                      ·{' '}
                      {recipePeople(
                        sessionRecipe(s, session),
                        session.servings,
                      )}{' '}
                      人份
                    </p>
                    <h2>{sessionRecipe(s, session).title}</h2>
                    <button
                      className="text-button"
                      onClick={() =>
                        openRecipe(sessionRecipe(s, session), session.id)
                      }
                    >
                      查看食材与来源
                    </button>
                  </div>
                  <div className="paper step-panel">
                    <div className="row-between">
                      <span className="eyebrow">
                        第 {session.step + 1} 步 /{' '}
                        {sessionRecipe(s, session).steps.length} 步
                      </span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            (state) => {
                              const v = activeSession(state);
                              if (!v) return;
                              if (v.status === 'paused') {
                                v.status = 'cooking';
                                if (v.timerRemaining)
                                  v.timerEnd = Date.now() + v.timerRemaining;
                                delete v.timerRemaining;
                              } else {
                                v.status = 'paused';
                                if (v.timerEnd)
                                  v.timerRemaining = Math.max(
                                    0,
                                    v.timerEnd - Date.now(),
                                  );
                                delete v.timerEnd;
                              }
                            },
                            session.status === 'paused'
                              ? '已继续，进度保留。'
                              : '已暂停，可以关闭页面后再来。',
                          )
                        }
                      >
                        {session.status === 'paused' ? (
                          <Play size={16} />
                        ) : (
                          <Pause size={16} />
                        )}{' '}
                        {session.status === 'paused' ? '继续' : '暂停并保存'}
                      </button>
                    </div>
                    <Progress
                      aria-label="跟做进度"
                      value={
                        (session.step /
                          sessionRecipe(s, session).steps.length) *
                        100
                      }
                    />
                    {session.status === 'paused' ? (
                      <h2 className="step-text">
                        已经暂停，锅边的事先照顾好。
                      </h2>
                    ) : (
                      <RecipeInstructions
                        recipe={sessionRecipe(s, session)}
                        batches={session.servings}
                        stepIndex={session.step}
                      />
                    )}
                    {currentStep &&
                      !session.timerEnd &&
                      !session.timerRemaining && (
                        <button
                          className="secondary recipe-step-timer"
                          disabled={busy || session.status === 'paused'}
                          onClick={() =>
                            mutate((state) => {
                              const active = activeSession(state);
                              if (
                                active?.id === session.id &&
                                active.step === session.step &&
                                active.status === 'cooking'
                              ) {
                                active.timerEnd =
                                  Date.now() + currentStep.minutes * 60000;
                              }
                            })
                          }
                        >
                          <Clock3 size={18} /> 按本步 {currentStep.minutes}{' '}
                          分钟计时
                        </button>
                      )}
                    {!!(session.timerEnd || session.timerRemaining) && (
                      <div className="timer">
                        <Clock3 size={21} />
                        <strong>
                          {Math.ceil(
                            Math.max(
                              0,
                              session.timerEnd
                                ? session.timerEnd - now
                                : session.timerRemaining || 0,
                            ) / 60000,
                          )}{' '}
                          分钟
                        </strong>
                        <span>
                          {session.timerEnd && now >= session.timerEnd
                            ? '时间到了，请自行检查熟度。'
                            : '提醒计时中 · 切后台可能延迟通知'}
                        </span>
                        <button
                          className="text-button"
                          onClick={() =>
                            mutate((state) => {
                              const v = activeSession(state);
                              if (v) {
                                delete v.timerEnd;
                                delete v.timerRemaining;
                              }
                            })
                          }
                        >
                          取消
                        </button>
                      </div>
                    )}
                    <div className="step-actions">
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          session.step === 0 ||
                          session.status === 'paused'
                        }
                        onClick={() =>
                          mutate((state) =>
                            stepSession(state, session.id, session.step - 1),
                          )
                        }
                      >
                        <ChevronLeft size={17} />
                        上一步
                      </button>
                      <button
                        className="primary"
                        disabled={busy || session.status === 'paused'}
                        onClick={() =>
                          mutate((state) =>
                            stepSession(state, session.id, session.step + 1),
                          )
                        }
                      >
                        {session.step ===
                        sessionRecipe(s, session).steps.length - 1
                          ? '做完了，核对实际消耗'
                          : '这一步好了'}
                        <ChevronRight size={17} />
                      </button>
                    </div>
                    <p className="muted">
                      进度已在本机保存。此时还没有扣减库存。
                    </p>
                  </div>
                </section>
              )}
            </TabsContent>
            <TabsContent value="archive">
              <div id="tour-stop-4" />
              <BaiweiGallery
                key={dataset}
                state={s}
                images={baiweiImages}
                plate={baiweiPlate}
                onOpenRecipe={openRecipe}
              />
            </TabsContent>
          </>
        )}
        <footer className="footer">
          中华食肆 HTML · 本地工作版 <span>菜谱有来源，食忆属于你。</span>
        </footer>
      </main>
      {tourStep !== null &&
        !dialog &&
        !detail &&
        !calibrationKey &&
        !seasoningOpen &&
        !reset &&
        !clear && (
          <KitchenTour
            step={tourStep}
            busy={busy}
            onStep={(step) => void moveTour(step)}
            onSkip={() => void moveTour(null)}
            onTry={async () => {
              if (await mutate((state) => saveTourStep(state, null))) {
                if (session) setPage('cooking');
                else {
                  setPage('today');
                  openRecipe(tourRecipe);
                }
              }
            }}
            onExit={async () => {
              if (await mutate((state) => saveTourStep(state, null)))
                await changeDataset('real');
            }}
          />
        )}
      <Dialog
        open={seasoningOpen}
        onOpenChange={(value) => {
          if (!busy) setSeasoningOpen(value);
        }}
      >
        <DialogContent className="kitchen-dialog" showCloseButton={false}>
          <button
            className="dialog-close icon-button"
            aria-label="关闭调料清单"
            disabled={busy}
            onClick={() => setSeasoningOpen(false)}
          >
            <X />
          </button>
          <DialogTitle>家里有哪些调料？</DialogTitle>
          <DialogDescription>
            油盐酱醋直接勾选，不用拍照。这里是
            {dataset === 'real' ? '真实厨房' : '样例厨房'}，未勾选的不会加入。
          </DialogDescription>
          {error && (
            <p className="warning-text" role="alert">
              {error}
            </p>
          )}
          {s && seasoningOpen && (
            <SeasoningChecklist
              key={dataset}
              state={s}
              busy={busy}
              mutate={mutate}
              done={finishSeasonings}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!calibrationCandidate}
        onOpenChange={(value) => {
          if (!value && !busy) setCalibrationKey(null);
        }}
      >
        <DialogContent
          className="kitchen-dialog calibration-dialog"
          showCloseButton={false}
        >
          <button
            className="dialog-close icon-button"
            aria-label="关闭库存校准"
            disabled={busy}
            onClick={() => setCalibrationKey(null)}
          >
            <X />
          </button>
          <DialogTitle>
            校准「{calibrationCandidate?.displayName || '食材'}」余量
          </DialogTitle>
          <DialogDescription>
            核对数量形式、数量和到期日期。保存后才会更新这张库存卡。
          </DialogDescription>
          {error && (
            <p className="warning-text" role="alert">
              {error}
            </p>
          )}
          {s && calibrationCandidate && (
            <CandidateEditor
              key={calibrationCandidate.key}
              candidate={calibrationCandidate}
              s={s}
              busy={busy}
              mutate={mutate}
              variant="calibration"
              onResolved={() => setCalibrationKey(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
      >
        <DialogContent className="kitchen-dialog" showCloseButton={false}>
          <button
            className="dialog-close icon-button"
            aria-label="关闭"
            onClick={() => setDialog(null)}
          >
            <X />
          </button>
          <DialogTitle>
            {dialog === 'manual'
              ? '把手边食材记下来'
              : dialog === 'voice'
                ? '说一说，食材就记下来了'
                : '让 WorkBuddy 看看你的厨房'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'manual'
              ? '先生成候选，再由你核对数量和到期日期。'
              : dialog === 'voice'
                ? '在这里录音，自动识别食材和数量。核对清单后，确认一次就入库。'
                : '在 WorkBuddy 对话上传照片，识别结果自动来到候选区，最后由你核对入库。'}
          </DialogDescription>
          {error && (
            <p role="alert" className="warning-text">
              {error}
            </p>
          )}
          <Choice
            label="这次是在盘点，还是补货？"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: 'stocktake', label: '盘点校准（默认，不自动累加）' },
              { value: 'restock', label: '补货（明确增加食材）' },
            ]}
          />
          {dialog === 'manual' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const id = uid();
                const text = JSON.stringify({
                  schemaVersion: '1.0',
                  requestId: id,
                  dataset,
                  mode,
                  source: 'manual-form',
                  createdAt: new Date().toISOString(),
                  warnings: [],
                  candidates: [
                    {
                      candidateId: 'manual-1',
                      displayName: manualName,
                      ...(manualAmount === ''
                        ? {}
                        : { amount: Number(manualAmount), unit: manualUnit }),
                      warnings: [],
                    },
                  ],
                });
                if (
                  await mutate(
                    (state) => stage(state, parseImport(text, dataset, mode)),
                    '已放到候选区，请确认后入库。',
                  )
                ) {
                  setDialog(null);
                  setPage('inventory');
                  setManualAmount('');
                }
              }}
            >
              <label className="field">
                食材名称
                <input
                  value={manualName}
                  maxLength={60}
                  required
                  onChange={(e) => setManualName(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  数量（不确定可留空）
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                  />
                </label>
                <Choice
                  label="单位"
                  value={manualUnit}
                  onChange={setManualUnit}
                  options={units.map((v) => ({ value: v, label: v }))}
                />
              </div>
              <button className="primary" disabled={busy}>
                放到候选区
                <ArrowUpRight size={17} />
              </button>
            </form>
          ) : dialog === 'voice' ? (
            s && (
              <VoiceIntake
                key={dataset + ':' + mode}
                state={s}
                mode={mode}
                busy={busy}
                mutate={mutate}
                done={(count) => {
                  setDialog(null);
                  setPage('inventory');
                  setMessage('已确认 ' + count + ' 种食材入库。');
                }}
              />
            )
          ) : (
            <>
              <output className="notice">
                {bridge.connection === 'connected'
                  ? bridge.status?.active
                    ? '正在等待 WorkBuddy 的识别结果'
                    : '本地连接已就绪'
                  : bridge.connection === 'checking'
                    ? '正在检查本地连接…'
                    : bridge.connection === 'standalone'
                      ? '当前是独立页面，尚未连接 WorkBuddy'
                      : '本地连接中断，未接收的结果会保留'}
              </output>
              {bridge.connection === 'standalone' ? (
                <>
                  <p>
                    首次使用，请在 WorkBuddy 加载随包的「中华食肆
                    Skill」，让它打开这份完整包里的厨房工作台。它会启动本地连接，并给出入口。
                  </p>
                  <p className="muted">
                    连接启动后，从下方入口打开。旧文件页面的库存仍保留在原浏览器地址，不会自动迁移到新入口。
                  </p>
                  <a
                    className="primary"
                    href={BRIDGE_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开已启动的本地工作台 <ArrowUpRight size={17} />
                  </a>
                </>
              ) : (
                <>
                  <ol className="instructions">
                    <li>在这里准备接收，锁定本次厨房和盘点方式。</li>
                    <li>
                      在 WorkBuddy 对话上传照片，使用「中华食肆
                      Skill」识别。也可在对话中发送核对过的食材文字。
                    </li>
                    <li>回到这里核对食材与数量。你确认前，库存不会变化。</li>
                  </ol>
                  {bridge.status?.active && (
                    <p className="muted">
                      本次接收：
                      {bridge.status.active.dataset === 'real'
                        ? '真实厨房'
                        : '样例厨房'}{' '}
                      ·{' '}
                      {bridge.status.active.mode === 'stocktake'
                        ? '盘点校准'
                        : '补货'}
                      。等待有效期 30 分钟；修改上方选项不会改变已开始的任务。
                    </p>
                  )}
                  {bridge.problem && (
                    <p role="alert" className="warning-text">
                      {bridge.problem}
                    </p>
                  )}
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={
                        bridge.busy ||
                        bridge.connection !== 'connected' ||
                        !!bridge.status?.active ||
                        !!bridge.status?.otherActive
                      }
                      onClick={() => void bridge.begin(dataset, mode)}
                    >
                      <Camera size={17} />
                      {bridge.status?.active
                        ? '等待照片识别…'
                        : '准备接收照片识别'}
                    </button>
                    {bridge.status?.active && (
                      <button
                        className="secondary"
                        disabled={bridge.busy}
                        onClick={() => void bridge.cancel()}
                      >
                        取消本次等待
                      </button>
                    )}
                    {bridge.status?.otherActive && (
                      <p className="muted">
                        另一个浏览器正在等待识别，请先完成或取消那次任务。
                      </p>
                    )}
                  </div>
                </>
              )}
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() => {
                    setDialog(null);
                    navigate('inventory');
                  }}
                >
                  查看待确认食材
                </button>
              </div>
              <p className="muted">
                照片只在你主动上传的 WorkBuddy
                对话中识别，需要其模型能力与网络。此连接只传递候选，不读取照片、账号或正式库存；本页不调用
                WorkBuddy API。
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!recipe}
        onOpenChange={(v) => {
          if (!v) closeRecipe();
        }}
      >
        <DialogContent
          className="kitchen-dialog recipe-dialog"
          showCloseButton={false}
        >
          {recipe && s && (
            <>
              <button
                className="dialog-close icon-button"
                aria-label="关闭菜谱详情"
                onClick={closeRecipe}
              >
                <X />
              </button>
              <div className="detail-heading">
                <RecipeArt recipe={recipe} />
                <div>
                  <p className="eyebrow">中华食肆 · 家常做法</p>
                  <DialogTitle>{recipe.title}</DialogTitle>
                  <DialogDescription>
                    约 {recipe.minutes} 分钟（含准备与等待） ·{' '}
                    {recipePeople(recipe, detailServings)} 人份 ·{' '}
                    {recipe.equipment}
                  </DialogDescription>
                  <span className="tag">
                    {recipe.workbuddyVersion
                      ? 'WorkBuddy 做法'
                      : '预设家常做法'}
                  </span>
                </div>
              </div>
              {detail?.sessionId && (
                <p className="muted">
                  本餐固定的做法；重新生成不会修改这份记录。
                </p>
              )}
              {recipe.yield && <p className="muted">{recipe.yield}</p>}
              <h3>需要的食材 · {recipePeople(recipe, detailServings)} 人份</h3>
              <MealIngredients
                recipe={recipe}
                rows={ingredientRows}
                disabled={busy || !!session}
                history={
                  detail?.sessionId
                    ? s.sessions.find((item) => item.id === detail.sessionId)
                        ?.mealOnlyIngredients
                    : undefined
                }
                onToggle={
                  detail?.sessionId
                    ? undefined
                    : (id, token) => {
                        setMealConfirmations((previous) => {
                          const other = previous.filter(
                            (c) => c.ingredientId !== id,
                          );
                          return previous.some(
                            (c) => c.ingredientId === id && c.token === token,
                          )
                            ? other
                            : [...other, { ingredientId: id, token }];
                        });
                        setFoodChecked('');
                      }
                }
              />
              {!detail?.sessionId && (
                <p className="meal-provision-note">
                  冰箱没记录的用料，点“确认拥有”即可。这部分只用于本餐，不加入冰箱；点“已拥有”可取消确认。
                </p>
              )}
              <RecipeDetailSections
                key={`${recipe.id}:${recipe.workbuddyVersion || RECIPE_VERSION}:${detail?.sessionId || ''}`}
                recipe={recipe}
                batches={detailServings}
              />
              {!detail?.sessionId && (
                <details className="paper workbuddy-cooking">
                  <summary>可选：请 WorkBuddy 另写一版做法</summary>
                  {cooking.ticket ? (
                    <>
                      <output>
                        {cooking.ticket.recipeId === recipe.id &&
                        cooking.ticket.dataset === dataset
                          ? '菜名和用料已准备好。'
                          : `另一份任务：${cooking.ticket.title}。`}
                        请在自己的 WorkBuddy 对话说：
                        <strong>“读取厨房任务，生成做菜步骤”</strong>。
                      </output>
                      <p className="muted">
                        步骤会自动回到这里，不用复制食材或做法。等待期间可以离开页面，取消需点下方按钮。
                      </p>
                      <button
                        className="text-button"
                        disabled={cooking.busy}
                        onClick={() => void cooking.cancel()}
                      >
                        取消这次请求
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        把这道菜的名字和用料交给你自己的
                        WorkBuddy，生成一份分步做法。
                      </p>
                      <button
                        className="secondary"
                        disabled={cooking.busy || busy}
                        onClick={() => void cooking.begin(recipe.id)}
                      >
                        {cooking.busy
                          ? '正在准备…'
                          : recipe.workbuddyVersion
                            ? '请 WorkBuddy 重新生成'
                            : '请 WorkBuddy 生成步骤'}
                      </button>
                    </>
                  )}
                  {cooking.problem && (
                    <p className="warning-text" role="alert">
                      {cooking.problem}
                    </p>
                  )}
                </details>
              )}
              {error && (
                <p role="alert" className="warning-text">
                  {error}
                </p>
              )}
              {!detail?.sessionId && (
                <>
                  <Tick
                    label={
                      dataset === 'demo'
                        ? '我正在演练样例流程，不把它记为真实做菜。'
                        : '我已核对食材、到期信息与过敏原，确认具备所需厨具。'
                    }
                    checked={foodChecked}
                    onChange={(checked) =>
                      setFoodChecked(checked ? checkKey : '')
                    }
                  />
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !!session ||
                      !foodChecked ||
                      ingredientRows.some((item) => !item.ready)
                    }
                    onClick={async () => {
                      if (!foodChecked) return;
                      const id = uid();
                      if (
                        await mutate(
                          (state) =>
                            startCooking(
                              state,
                              recipe.id,
                              id,
                              undefined,
                              recipe.workbuddyVersion || RECIPE_VERSION,
                              ingredientRows
                                .filter((i) => i.confirmed)
                                .map((i) => ({
                                  ingredientId: i.id,
                                  token: i.token,
                                })),
                            ),
                          '这一餐已开始，步骤会保存在本机。',
                        )
                      ) {
                        closeRecipe();
                        setPage('cooking');
                      }
                    }}
                  >
                    {session
                      ? '已有一餐进行中'
                      : dataset === 'demo'
                        ? '开始这道菜的演练'
                        : '食材备好了，开始做'}
                  </button>
                  {ingredientRows.some((item) => !item.ready) && (
                    <p className="warning-text">
                      请在上方逐项确认本餐拥有的食材，再勾选核对后开始做。
                    </p>
                  )}
                </>
              )}
              {s.sessions.filter(
                (x) => x.recipeId === recipe.id && x.status === 'completed',
              ).length > 0 && (
                <section>
                  <h3>
                    {dataset === 'demo' ? '样例制作历史' : '我的制作历史'}
                  </h3>
                  {s.sessions
                    .filter(
                      (x) =>
                        x.recipeId === recipe.id && x.status === 'completed',
                    )
                    .map((x) => (
                      <div className="history-item" key={x.id}>
                        <div>
                          <strong>{mealRatingSummary(x)}</strong>
                          <small>
                            {new Date(x.completedAt!).toLocaleString('zh-CN')}
                          </small>
                          <p>{x.familyMemory || '这一次，把一餐好好做完。'}</p>
                          <span className="tag">
                            {x.sampleRecord
                              ? '预置样例食忆 · 非真实做菜记录'
                              : '个人记忆 · 用户自述'}
                          </span>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => exportEntry(recipe, x, dataset)}
                        >
                          <Download size={16} />
                          导出这份百味图
                        </button>
                      </div>
                    ))}
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={reset || clear}
        onOpenChange={(v) => {
          if (!v) {
            setReset(false);
            setClear(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {reset ? '恢复初始样例厨房？' : '清空当前厨房库存？'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {reset
              ? '用 22 项已备食材和 35 道样例食忆替换当前样例厨房，并重新开始参观。你在样例中的修改和演练将被清除，不能撤销；如需保留请先导出完整备份。真实厨房完全保留。'
              : '仅清空当前 ' +
                (dataset === 'demo' ? '样例' : '真实') +
                ' 厨房的库存和待确认候选，保留已完成百味图。请先导出完整备份；清空本身不能撤销。进行中的一餐必须先完成。'}
          </AlertDialogDescription>
          <div className="actions">
            <AlertDialogCancel>保留数据</AlertDialogCancel>
            <button
              className="primary"
              disabled={busy || (!reset && !!session)}
              onClick={async () => {
                const doReset = reset;
                const targetDataset = datasetRef.current;
                let ignored: string[];
                try {
                  ignored = await bridge.beforeReset(targetDataset);
                } catch {
                  setError(
                    '请先恢复本地连接，再清空，避免旧识别结果重新出现。',
                  );
                  return;
                }
                if (
                  await mutate(
                    (state) => {
                      if (state.dataset !== targetDataset)
                        throw new Error('厨房已切换，未清空数据。');
                      const tombstones = [
                        ...new Set([
                          ...(state.bridgeIgnoredTicketIds || []),
                          ...ignored,
                        ]),
                      ];
                      if (doReset) {
                        if (state.dataset !== 'demo')
                          throw new Error('只能重置样例。');
                        restoreDemoKitchen(state);
                      } else {
                        if (activeSession(state))
                          throw new Error('请先完成正在做的一餐。');
                        state.inventory = [];
                        state.candidates = state.candidates.filter(
                          (c) => c.status !== 'pending',
                        );
                      }
                      state.bridgeIgnoredTicketIds = tombstones;
                    },
                    doReset
                      ? '初始样例已恢复，可以重新参观。真实厨房未改变。'
                      : '当前库存已清空，已完成百味图保留。',
                  )
                ) {
                  try {
                    await bridge.afterReset(targetDataset, ignored);
                  } catch {
                    setMessage(
                      '本机清空已完成。旧识别已在本机标记忽略，连接恢复后会补回执。',
                    );
                  }
                  setReset(false);
                  setClear(false);
                  if (doReset) {
                    setTourPaused(false);
                    setPreviewStep(0);
                    setPage('today');
                  }
                }
              }}
            >
              {reset ? '确认恢复初始样例' : '确认清空库存'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
