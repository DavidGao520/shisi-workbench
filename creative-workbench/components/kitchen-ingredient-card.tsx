/* oxlint-disable next/no-img-element -- Layered inline game artwork must also render in the self-contained HTML build. */
import { today } from '@/lib/kitchen';
import { pantryCardArt } from '@/lib/art';
import { PRESENT_QUANTITY } from '@/lib/seasonings';

type CardStatus = 'pending' | 'confirmed';

type KitchenIngredientCardProps = {
  ingredientId: string;
  name: string;
  status: CardStatus;
  quantity: string;
  expiryDate?: string;
  expired?: boolean;
  triggerLabel?: string;
  triggerDisabled?: boolean;
  onTrigger?: () => void;
};

const dayMs = 24 * 60 * 60 * 1000;

function expiryPresentation(
  expiryDate: string | undefined,
  status: CardStatus,
  expired: boolean,
) {
  if (!expiryDate)
    return {
      label: status === 'pending' ? '到期日待确认' : '未记录到期日',
      tone: 'unknown',
    };
  const days = Math.round(
    (Date.parse(expiryDate + 'T12:00:00Z') -
      Date.parse(today() + 'T12:00:00Z')) /
      dayMs,
  );
  if (expired || days < 0) return { label: '已过期', tone: 'expired' };
  const label =
    days === 0 ? '今天到期' : days === 1 ? '明天到期' : days + ' 天后到期';
  return {
    label: status === 'pending' ? '预计' + label : label,
    tone: days <= 2 ? 'urgent' : days <= 4 ? 'soon' : 'normal',
  };
}

export function KitchenIngredientCard({
  ingredientId,
  name,
  status,
  quantity,
  expiryDate,
  expired = false,
  triggerLabel,
  triggerDisabled = false,
  onTrigger,
}: KitchenIngredientCardProps) {
  const cardArt = pantryCardArt[ingredientId];
  if (!cardArt) return null;

  const stateLabel = status === 'pending' ? '待校准' : '已校准';
  const categoryLabel = cardArt.kind === 'seasoning' ? '调料' : '食材';
  const quantityUnknown =
    quantity === '数量待确认' || quantity === PRESENT_QUANTITY;
  const quantityLabel =
    status === 'pending'
      ? quantityUnknown
        ? '数量待确认'
        : '识别到 ' + quantity
      : quantity;
  const expiry = expiryPresentation(expiryDate, status, expired);
  const dateLabel = expiryDate?.replaceAll('-', '.');
  const accessibleLabel = [
    name,
    categoryLabel,
    stateLabel,
    quantityLabel,
    expiry.label,
    expiryDate,
  ]
    .filter(Boolean)
    .join('，');

  const interactive = status === 'confirmed' && triggerLabel && onTrigger;

  return (
    <article
      className={`kitchen-ingredient-card kitchen-ingredient-card--${status} kitchen-ingredient-card--${cardArt.theme}${expired ? ' kitchen-ingredient-card--expired' : ''}`}
      aria-label={interactive ? undefined : accessibleLabel}
    >
      <div className="kitchen-ingredient-card__visual">
        <img
          className="kitchen-ingredient-card__frame"
          src={cardArt.frame}
          width="640"
          height="960"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className="kitchen-ingredient-card__art"
          src={cardArt.image}
          width="512"
          height="512"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span className="kitchen-ingredient-card__status" aria-hidden="true">
          {status === 'pending' ? '?' : '✓'}
        </span>
        <strong className="kitchen-ingredient-card__name">{name}</strong>
        <span className="kitchen-ingredient-card__category">
          {categoryLabel}
        </span>
        <div className="kitchen-ingredient-card__details">
          {status === 'pending' && (
            <span className="kitchen-ingredient-card__state">{stateLabel}</span>
          )}
          <strong className="kitchen-ingredient-card__quantity">
            {quantityLabel}
          </strong>
          <span
            className={`kitchen-ingredient-card__expiry kitchen-ingredient-card__expiry--${expiry.tone}`}
          >
            {expiry.label}
          </span>
          {expiryDate && <time dateTime={expiryDate}>{dateLabel}</time>}
        </div>
      </div>
      {interactive && (
        <button
          type="button"
          className="kitchen-ingredient-card__trigger"
          aria-label={`${accessibleLabel}。${triggerLabel}`}
          disabled={triggerDisabled}
          onClick={onTrigger}
        />
      )}
    </article>
  );
}
