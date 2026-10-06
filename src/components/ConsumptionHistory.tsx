import { useMemo } from 'react'
import {
  formatHistoryDateLabel,
  formatHistoryTime,
  getSeoulDateKey,
} from '../lib/date'
import type { ConsumptionRecord, FoodReaction } from '../types'
import { groupConsumptionRecordsForDisplay } from '../lib/consumptionHistoryGroups'
import { Icon } from './Icon'

interface ConsumptionHistoryProps {
  records: ConsumptionRecord[]
  loading: boolean
  onShowInventory: () => void
  onEditRecord: (record: ConsumptionRecord) => void
  onEditGroupTime: (records: ConsumptionRecord[], label: string) => void
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

function getGroupedReactionState(records: ConsumptionRecord[]) {
  const first = records[0]
  const allSame = records.every(
    (record) =>
      record.reaction === first.reaction &&
      record.reactionNote === first.reactionNote,
  )

  if (!allSame) {
    return {
      mixed: true,
      reaction: null as FoodReaction | null,
      note: '',
    }
  }

  return {
    mixed: false,
    reaction: first.reaction,
    note: first.reactionNote,
  }
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
  onShowInventory,
  onEditRecord,
  onEditGroupTime,
}: ConsumptionHistoryProps) {
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
                <div className="day-log-card__meta">
                  {group.records.length > 1 && (
                    <button
                      aria-label={`${group.label} 먹은 기록 ${group.records.length}개 선택 시간 수정`}
                      className="day-log-card__bulk-time"
                      onClick={() => onEditGroupTime(group.records, group.label)}
                      type="button"
                    >
                      <Icon name="clock" size={13} />
                      선택 시간 수정
                    </button>
                  )}
                  <span>{group.records.length}개</span>
                </div>
              </header>
              <ol>
                {groupConsumptionRecordsForDisplay(group.records).map((displayGroup) => {
                  const representative = displayGroup.records[0]
                  const unitText =
                    displayGroup.unitAmount && displayGroup.unit
                      ? `${displayGroup.unitAmount}${displayGroup.unit}`
                      : null
                  const count = displayGroup.records.length
                  const containsFirstRecord = displayGroup.records.some((record) =>
                    firstRecordIds.has(record.id),
                  )
                  const groupedReaction = getGroupedReactionState(displayGroup.records)

                  return (
                    <li
                      className={`log-row ${count > 1 ? 'is-grouped' : ''}`}
                      key={displayGroup.key}
                    >
                      <div className="log-row__main">
                        <time dateTime={representative.consumedAt}>
                          {displayGroup.time}
                        </time>
                        <div className="log-row__name">
                          <span aria-hidden="true" />
                          <strong>{displayGroup.cubeName}</strong>
                          {unitText && <small>1개 {unitText}</small>}
                          {containsFirstRecord && (
                            <em className="first-record-badge">이 큐브 첫 기록</em>
                          )}
                        </div>
                        <b>{count}개</b>
                      </div>

                      {count === 1 ? (
                        <div className="reaction-row">
                          <button
                            aria-label={`${representative.cubeName} 반응 ${
                              representative.reaction
                                ? reactionMeta[representative.reaction].label
                                : '미기록'
                            } 수정`}
                            className={`reaction-row__reaction ${
                              representative.reaction
                                ? `is-${representative.reaction}`
                                : 'is-empty'
                            }`}
                            onClick={() => onEditRecord(representative)}
                            type="button"
                          >
                            {representative.reaction ? (
                              <>
                                <span aria-hidden="true">
                                  {reactionMeta[representative.reaction].emoji}
                                </span>
                                {reactionMeta[representative.reaction].label}
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">○</span>
                                반응 미기록
                              </>
                            )}
                          </button>
                          <button
                            aria-label={`${representative.cubeName} ${displayGroup.time} 먹은 기록 수정 또는 삭제`}
                            className="reaction-row__edit"
                            onClick={() => onEditRecord(representative)}
                            type="button"
                          >
                            <Icon name="edit" size={14} />
                            수정·삭제
                          </button>
                          {representative.reactionNote && <p>{representative.reactionNote}</p>}
                        </div>
                      ) : (
                        <div className="reaction-row reaction-row--grouped">
                          <span
                            className={`reaction-row__reaction is-static ${
                              groupedReaction.mixed
                                ? 'is-mixed'
                                : groupedReaction.reaction
                                  ? `is-${groupedReaction.reaction}`
                                  : 'is-empty'
                            }`}
                          >
                            {groupedReaction.mixed ? (
                              <>
                                <span aria-hidden="true">≠</span>
                                반응·메모 다름
                              </>
                            ) : groupedReaction.reaction ? (
                              <>
                                <span aria-hidden="true">
                                  {reactionMeta[groupedReaction.reaction].emoji}
                                </span>
                                {reactionMeta[groupedReaction.reaction].label}
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">○</span>
                                반응 미기록
                              </>
                            )}
                          </span>

                          <details className="grouped-record-details">
                            <summary>
                              <Icon name="edit" size={14} />
                              {count}개 상세·수정
                            </summary>
                            <div className="grouped-record-details__list">
                              {displayGroup.records.map((record, index) => {
                                const reactionLabel = record.reaction
                                  ? reactionMeta[record.reaction].label
                                  : '반응 미기록'

                                return (
                                  <div className="grouped-record-detail" key={record.id}>
                                    <div>
                                      <strong>{index + 1}번째 기록</strong>
                                      <span>
                                        {record.reaction && (
                                          <i aria-hidden="true">
                                            {reactionMeta[record.reaction].emoji}
                                          </i>
                                        )}
                                        {reactionLabel}
                                      </span>
                                      {record.reactionNote && <small>{record.reactionNote}</small>}
                                    </div>
                                    <button
                                      aria-label={`${displayGroup.cubeName} ${displayGroup.time} ${index + 1}번째 먹은 기록 수정 또는 삭제`}
                                      onClick={() => onEditRecord(record)}
                                      type="button"
                                    >
                                      수정·삭제
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </details>

                          {!groupedReaction.mixed && groupedReaction.note && (
                            <p>{groupedReaction.note}</p>
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
