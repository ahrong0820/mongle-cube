import { useMemo, useState } from 'react'
import {
  formatHistoryDateLabel,
  formatHistoryTime,
  getSeoulDateKey,
} from '../lib/date'
import type { ConsumptionRecord, FoodReaction } from '../types'
import { Icon } from './Icon'

interface ConsumptionHistoryProps {
  records: ConsumptionRecord[]
  loading: boolean
  pendingUndoId: string | null
  onShowInventory: () => void
  onUndo: (record: ConsumptionRecord) => void
  onEditReaction: (record: ConsumptionRecord) => void
}

const reactionMeta: Record<FoodReaction, { label: string; emoji: string }> = {
  liked: { label: '잘 먹음', emoji: '😋' },
  okay: { label: '보통', emoji: '🙂' },
  disliked: { label: '거부', emoji: '🙅' },
  watch: { label: '관찰 필요', emoji: '👀' },
}

interface RecordGroup {
  key: string
  label: string
  records: ConsumptionRecord[]
}

function sortRecords(records: ConsumptionRecord[]) {
  return [...records].sort((a, b) => {
    const consumedDifference =
      new Date(b.consumedAt).getTime() - new Date(a.consumedAt).getTime()
    if (consumedDifference !== 0) return consumedDifference
    return b.createdAt.localeCompare(a.createdAt)
  })
}

function groupRecords(records: ConsumptionRecord[]): RecordGroup[] {
  const groups = new Map<string, RecordGroup>()

  for (const record of sortRecords(records)) {
    const key = getSeoulDateKey(record.consumedAt)
    const current = groups.get(key)
    if (current) {
      current.records.push(record)
    } else {
      groups.set(key, {
        key,
        label: formatHistoryDateLabel(record.consumedAt),
        records: [record],
      })
    }
  }

  return [...groups.values()]
}

function getTodaySummary(records: ConsumptionRecord[]) {
  const todayKey = getSeoulDateKey(new Date())
  const todayRecords = records.filter(
    (record) => getSeoulDateKey(record.consumedAt) === todayKey,
  )
  const counts = new Map<string, number>()
  for (const record of todayRecords) {
    counts.set(record.cubeName, (counts.get(record.cubeName) ?? 0) + 1)
  }

  return {
    count: todayRecords.length,
    detail: [...counts.entries()]
      .map(([name, count]) => `${name} ${count}`)
      .join(' · '),
  }
}

function getSevenDaySummary(records: ConsumptionRecord[], now = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000
  const weekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  })
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() - (6 - index) * dayMs)
    const key = getSeoulDateKey(date)
    return {
      key,
      label: index === 6 ? '오늘' : weekdayFormatter.format(date).replace('요일', ''),
      count: records.filter((record) => getSeoulDateKey(record.consumedAt) === key).length,
    }
  })
  const max = Math.max(1, ...days.map((day) => day.count))
  return { days, max }
}

function getReactionSummary(records: ConsumptionRecord[]) {
  const summary = new Map<
    string,
    { name: string; total: number; reactions: Partial<Record<FoodReaction, number>> }
  >()

  for (const record of records) {
    const current = summary.get(record.cubeName) ?? {
      name: record.cubeName,
      total: 0,
      reactions: {},
    }
    current.total += 1
    if (record.reaction) {
      current.reactions[record.reaction] = (current.reactions[record.reaction] ?? 0) + 1
    }
    summary.set(record.cubeName, current)
  }

  return [...summary.values()].sort((a, b) => {
    const watchDifference = (b.reactions.watch ?? 0) - (a.reactions.watch ?? 0)
    return watchDifference || b.total - a.total || a.name.localeCompare(b.name, 'ko')
  })
}

export function ConsumptionHistory({
  records,
  loading,
  pendingUndoId,
  onShowInventory,
  onUndo,
  onEditReaction,
}: ConsumptionHistoryProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const groups = useMemo(() => groupRecords(records), [records])
  const today = useMemo(() => getTodaySummary(records), [records])
  const week = useMemo(() => getSevenDaySummary(records), [records])
  const reactionSummary = useMemo(() => getReactionSummary(records), [records])
  const firstRecordIds = useMemo(() => {
    const firstByCube = new Map<string, ConsumptionRecord>()
    for (const record of [...records].sort(
      (a, b) => new Date(a.consumedAt).getTime() - new Date(b.consumedAt).getTime(),
    )) {
      if (!firstByCube.has(record.cubeName)) firstByCube.set(record.cubeName, record)
    }
    return new Set([...firstByCube.values()].map((record) => record.id))
  }, [records])
  const latestId = groups[0]?.records[0]?.id ?? null

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="record-summary">
        <div className="record-summary__icon" aria-hidden="true">
          <Icon name="bowl" size={27} />
        </div>
        <div>
          <span className="eyebrow">차곡차곡 먹은 기록</span>
          <h1 id="history-title">
            지금까지 <strong>{records.length}</strong>개 먹었어요
          </h1>
          <p>
            {today.count > 0
              ? `오늘 ${today.count}개${today.detail ? ` · ${today.detail}` : ''}`
              : '오늘은 아직 기록 전이에요.'}
          </p>
        </div>
      </div>

      {records.length > 0 && (
        <div className="week-summary" aria-label="최근 7일 먹은 큐브 수">
          <div className="week-summary__heading">
            <strong>최근 7일</strong>
            <span>모두 {week.days.reduce((sum, day) => sum + day.count, 0)}개</span>
          </div>
          <div className="week-bars">
            {week.days.map((day) => (
              <div className="week-bar" key={day.key}>
                <span>{day.count || ''}</span>
                <i style={{ height: `${Math.max(day.count ? 18 : 4, (day.count / week.max) * 54)}px` }} />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="history-skeletons" aria-label="먹은 기록을 불러오는 중">
          <div />
          <div />
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state history-empty">
          <img
            alt="빈 이유식 그릇을 든 아기 곰"
            src={`${import.meta.env.BASE_URL}assets/empty-cubes.svg`}
          />
          <h2>아직 먹은 기록이 없어요</h2>
          <p>냉동실에서 ‘먹었어요’를 누르면 여기에 차곡차곡 모여요.</p>
          <button className="primary-button" onClick={onShowInventory} type="button">
            <Icon name="snowflake" />
            냉동실 보기
          </button>
        </div>
      ) : (
        <div className="history-groups">
          {groups.map((group) => (
            <section className="day-log-card" key={group.key}>
              <header>
                <h2>{group.label}</h2>
                <span>{group.records.length}개</span>
              </header>
              <ol>
                {group.records.map((record) => {
                  const isLatest = record.id === latestId
                  const unitText =
                    record.unitAmount && record.unit
                      ? `${record.unitAmount}${record.unit}`
                      : null

                  return (
                    <li className="log-row" key={record.id}>
                      <div className="log-row__main">
                        <time dateTime={record.consumedAt}>
                          {formatHistoryTime(record.consumedAt)}
                        </time>
                        <div className="log-row__name">
                          <span aria-hidden="true" />
                          <strong>{record.cubeName}</strong>
                          {unitText && <small>1개 {unitText}</small>}
                          {firstRecordIds.has(record.id) && (
                            <em className="first-record-badge">이 큐브 첫 기록</em>
                          )}
                        </div>
                        <b>1개</b>
                      </div>

                      <div className="reaction-row">
                        <button onClick={() => onEditReaction(record)} type="button">
                          {record.reaction ? (
                            <>
                              <span aria-hidden="true">{reactionMeta[record.reaction].emoji}</span>
                              {reactionMeta[record.reaction].label}
                              <small>수정</small>
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true">＋</span>
                              아기 반응 기록
                            </>
                          )}
                        </button>
                        {record.reactionNote && <p>{record.reactionNote}</p>}
                      </div>

                      {isLatest && (
                        <div className="undo-row">
                          {confirmingId === record.id ? (
                            <>
                              <span>잘못 누른 기록인가요?</span>
                              <button
                                disabled={pendingUndoId === record.id}
                                onClick={() => setConfirmingId(null)}
                                type="button"
                              >
                                아니요
                              </button>
                              <button
                                className="undo-row__confirm"
                                disabled={pendingUndoId === record.id}
                                onClick={() => onUndo(record)}
                                type="button"
                              >
                                {pendingUndoId === record.id ? '되돌리는 중' : '되돌리기'}
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmingId(record.id)} type="button">
                              <Icon name="refresh" size={15} />
                              최근 기록 되돌리기
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {reactionSummary.length > 0 && (
        <details className="reaction-summary">
          <summary>
            큐브별 반응 모아보기
            <Icon name="chevron" size={17} />
          </summary>
          <div className="reaction-summary__list">
            {reactionSummary.map((item) => (
              <div className={item.reactions.watch ? 'has-watch' : ''} key={item.name}>
                <strong>{item.name}</strong>
                <span>
                  {item.reactions.watch
                    ? `👀 관찰 필요 ${item.reactions.watch}회`
                    : `${item.total}번 먹음`}
                </span>
                <small>
                  {(Object.entries(item.reactions) as [FoodReaction, number][])
                    .filter(([, count]) => count > 0)
                    .map(([reaction, count]) => `${reactionMeta[reaction].label} ${count}`)
                    .join(' · ') || '아직 반응 기록 없음'}
                </small>
              </div>
            ))}
          </div>
          <p className="reaction-summary__notice">
            이 기록은 보호자가 살펴보기 위한 메모예요. 이상 반응이 걱정되면 의료진과 상담해 주세요.
          </p>
        </details>
      )}
    </section>
  )
}
