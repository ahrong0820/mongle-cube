import {
  formatDateTime,
  formatShortDate,
  getExpiryStatus,
  getRemainingLabel,
} from '../lib/date'
import type { CubeBatch, CubeDisposal } from '../types'
import { Icon } from './Icon'

interface CubeCardProps {
  batch: CubeBatch
  disposal?: CubeDisposal | null
  pending?: boolean
  onConsume: (batch: CubeBatch) => void
  onEdit: (batch: CubeBatch) => void
  onIncrement: (batch: CubeBatch) => void
  onRemake: (batch: CubeBatch) => void
  onDiscard?: (batch: CubeBatch) => void
  onCancelDisposal?: (batch: CubeBatch, disposal: CubeDisposal) => void
}

const statusText = {
  fresh: '여유',
  soon: '기한 임박',
  expired: '기한 지남',
}

const categoryText: Record<CubeBatch['category'], string> = {
  base: '베이스',
  topping: '토핑',
  snack: '간식',
  other: '기타',
}

export function CubeCard({
  batch,
  disposal = null,
  pending,
  onConsume,
  onEdit,
  onIncrement,
  onRemake,
  onDiscard,
  onCancelDisposal,
}: CubeCardProps) {
  const status = getExpiryStatus(batch.expiresAt)
  const empty = batch.quantity === 0
  const discarded = Boolean(disposal)
  const unitText =
    batch.unitAmount && batch.unit ? `1개 ${batch.unitAmount}${batch.unit}` : null

  return (
    <article
      className={`cube-card ${empty ? 'is-empty' : ''} ${discarded ? 'is-discarded' : ''}`}
      data-status={status}
    >
      <div className="cube-card__top">
        <div className="cube-card__title-wrap">
          <div className="cube-card__decor" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h3>{batch.name}</h3>
            <div className="cube-card__badges">
              <span
                className={`unit-badge category-badge category-badge--${batch.category}`}
              >
                {categoryText[batch.category]}
              </span>
              <span
                className={`status-badge status-badge--${discarded ? 'discarded' : empty ? 'empty' : status}`}
              >
                {discarded
                  ? `${disposal?.quantity ?? 0}개 폐기`
                  : empty
                    ? '다 먹음'
                    : statusText[status]}
              </span>
              {unitText && <span className="unit-badge">{unitText}</span>}
            </div>
          </div>
        </div>
        <button
          aria-label={`${batch.name} 수정하기`}
          className="icon-button"
          onClick={() => onEdit(batch)}
          type="button"
        >
          <Icon name="edit" size={19} />
        </button>
      </div>

      <div className="cube-card__body">
        <div className="quantity-block" aria-label={`남은 수량 ${batch.quantity}개`}>
          <strong>{batch.quantity}</strong>
          <span>개 남음</span>
        </div>
        <div className="date-block">
          <span>{formatShortDate(batch.preparedAt)} 제작</span>
          <strong className={`remaining remaining--${status}`}>
            {discarded
              ? `${disposal?.quantity ?? 0}개 폐기`
              : empty
                ? '수량 없음'
                : getRemainingLabel(batch.expiresAt)}
          </strong>
          <span>{formatDateTime(batch.expiresAt)}까지</span>
        </div>
      </div>

      {batch.memo && <p className="cube-card__memo">{batch.memo}</p>}

      <div className="quantity-control" aria-label={`${batch.name} 수량 조절`}>
        <button
          aria-label={`${batch.name} 1개 먹은 기록 남기기`}
          disabled={pending || empty}
          onClick={() => onConsume(batch)}
          type="button"
        >
          <Icon name="minus" size={22} />
          <span>먹었어요</span>
        </button>
        <div aria-hidden="true" className="quantity-control__count">
          {pending ? <span className="mini-spinner" /> : batch.quantity}
        </div>
        {empty ? (
          <button
            aria-label={`${batch.name} 다시 만들기`}
            disabled={pending}
            onClick={() => onRemake(batch)}
            type="button"
          >
            <Icon name="refresh" size={21} />
            <span>다시 만들기</span>
          </button>
        ) : (
          <button
            aria-label={`${batch.name} 1개 늘리기`}
            disabled={pending}
            onClick={() => onIncrement(batch)}
            type="button"
          >
            <Icon name="plus" size={22} />
            <span>추가</span>
          </button>
        )}
      </div>

      {!empty && onDiscard && (
        <button
          className={`cube-card__discard ${status === 'expired' ? 'is-expired' : ''}`}
          disabled={pending}
          onClick={() => onDiscard(batch)}
          type="button"
        >
          <Icon name="trash" size={16} />
          남은 {batch.quantity}개 폐기
        </button>
      )}

      {discarded && disposal && onCancelDisposal && (
        <button
          className="cube-card__cancel-disposal"
          disabled={pending}
          onClick={() => onCancelDisposal(batch, disposal)}
          type="button"
        >
          폐기 기록 취소 · {disposal.quantity}개 복원
        </button>
      )}
    </article>
  )
}
