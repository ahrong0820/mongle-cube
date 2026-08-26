import { useMemo, useState } from 'react'
import { getBabyAgeDays, getWeaningDay } from '../lib/baby'
import { formatHistoryTime, getSeoulDateKey } from '../lib/date'
import type {
  BabyProfile,
  ConsumptionRecord,
  CubeBatch,
  CubeCategory,
  CubeUnit,
  FoodReaction,
} from '../types'
import { Icon } from './Icon'

export interface ConsumptionCalendarProps {
  batches: CubeBatch[]
  profile: BabyProfile
  records: ConsumptionRecord[]
  onEditRecord: (record: ConsumptionRecord) => void
  onEditProfile: () => void
}

interface CubeGroup {
  name: string
  count: number
  records: ConsumptionRecord[]
  hasWatch: boolean
}

interface CalendarCategorySummary {
  category: CubeCategory
  groups: CubeGroup[]
}

interface CalendarNewFoodSummary {
  name: string
  reaction: FoodReaction | null
}

interface CalendarDaySummary {
  categories: CalendarCategorySummary[]
  newFoods: CalendarNewFoodSummary[]
  reactions: Array<[FoodReaction, number]>
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const DATE_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const CATEGORY_ORDER: CubeCategory[] = ['base', 'topping', 'snack', 'other']
const CATEGORY_META: Record<CubeCategory, { label: string; symbol: string }> = {
  base: { label: '베이스', symbol: 'B' },
  topping: { label: '토핑', symbol: 'T' },
  snack: { label: '간식', symbol: 'S' },
  other: { label: '기타', symbol: '＋' },
}

const REACTION_META: Record<
  FoodReaction,
  { label: string; shortLabel: string; symbol: string; priority: number }
> = {
  liked: { label: '잘 먹음', shortLabel: '잘', symbol: '♥', priority: 1 },
  okay: { label: '보통', shortLabel: '보통', symbol: '●', priority: 0 },
  disliked: { label: '거부', shortLabel: '거부', symbol: '–', priority: 2 },
  watch: { label: '관찰 필요', shortLabel: '관찰', symbol: '!', priority: 3 },
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return formatDateKey(date) === value ? date : null
}

function parseMonthKey(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return formatMonthKey(date) === value ? date : null
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthKey(date: Date) {
  return formatDateKey(date).slice(0, 7)
}

function shiftMonth(value: string, amount: number) {
  const current = parseMonthKey(value) ?? new Date()
  return formatMonthKey(
    new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + amount, 1)),
  )
}

function formatMonthHeading(value: string) {
  const date = parseMonthKey(value)
  if (!date) return value
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`
}

function formatDateHeading(value: string) {
  const date = parseDateKey(value)
  if (!date) return value
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${DATE_WEEKDAY_LABELS[date.getUTCDay()]}요일`
}

function getMonthDays(value: string) {
  const firstDay = parseMonthKey(value)
  if (!firstDay) return []

  const mondayOffset = (firstDay.getUTCDay() + 6) % 7
  const daysInMonth = new Date(
    Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const gridStart = new Date(firstDay)
  gridStart.setUTCDate(gridStart.getUTCDate() - mondayOffset)

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart)
    date.setUTCDate(gridStart.getUTCDate() + index)
    return date
  })
}

function sortRecords(records: ConsumptionRecord[]) {
  return [...records].sort((a, b) => {
    const timeDifference = new Date(b.consumedAt).getTime() - new Date(a.consumedAt).getTime()
    return timeDifference || b.createdAt.localeCompare(a.createdAt)
  })
}

function groupCubes(records: ConsumptionRecord[]): CubeGroup[] {
  const groups = new Map<string, CubeGroup>()

  for (const record of sortRecords(records).reverse()) {
    const group = groups.get(record.cubeName)
    if (group) {
      group.count += 1
      group.records.push(record)
      group.hasWatch ||= record.reaction === 'watch'
    } else {
      groups.set(record.cubeName, {
        name: record.cubeName,
        count: 1,
        records: [record],
        hasWatch: record.reaction === 'watch',
      })
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.hasWatch !== b.hasWatch) return a.hasWatch ? -1 : 1
    return a.records[0].consumedAt.localeCompare(b.records[0].consumedAt)
  })
}

function getDayReactions(records: ConsumptionRecord[]) {
  const counts = new Map<FoodReaction, number>()
  for (const record of records) {
    if (record.reaction) counts.set(record.reaction, (counts.get(record.reaction) ?? 0) + 1)
  }

  return [...counts.entries()].sort(
    ([first], [second]) => REACTION_META[second].priority - REACTION_META[first].priority,
  )
}

function formatUnit(record: ConsumptionRecord) {
  return record.unitAmount && record.unit ? `1개 ${record.unitAmount}${record.unit}` : '1개'
}

function getAmountSummary(records: ConsumptionRecord[]) {
  const totals = new Map<CubeUnit, number>()
  for (const record of records) {
    if (record.unitAmount && record.unit) {
      totals.set(record.unit, (totals.get(record.unit) ?? 0) + record.unitAmount)
    }
  }

  const measured = [...totals.entries()].map(([unit, amount]) =>
    `${Number(amount.toFixed(2))}${unit}`,
  )
  return [`${records.length}개`, ...measured].join(' · ')
}

function getStrongestReaction(records: ConsumptionRecord[]) {
  return records
    .map((record) => record.reaction)
    .filter((reaction): reaction is FoodReaction => Boolean(reaction))
    .sort((a, b) => REACTION_META[b].priority - REACTION_META[a].priority)[0] ?? null
}

function getSpokenReactionSummary(
  reactions: Array<[FoodReaction, number]>,
  recordCount: number,
) {
  const recordedCount = reactions.reduce((total, [, count]) => total + count, 0)
  const parts = reactions.map(
    ([reaction, count]) => `${REACTION_META[reaction].label} ${count}개`,
  )
  if (recordCount > recordedCount) parts.push(`미기록 ${recordCount - recordedCount}개`)
  return parts.length > 0 ? `반응 ${parts.join(', ')}` : '반응 미기록'
}

function buildCalendarDaySummary(
  records: ConsumptionRecord[],
  categoryByBatchId: ReadonlyMap<string, CubeCategory>,
  firstDateByCube: ReadonlyMap<string, string>,
  dateKey: string,
): CalendarDaySummary {
  const categories = CATEGORY_ORDER.map((category) => ({
    category,
    groups: groupCubes(
      records.filter(
        (record) => (categoryByBatchId.get(record.batchId) ?? 'other') === category,
      ),
    ),
  })).filter(({ category, groups }) => category !== 'other' || groups.length > 0)
  const newFoodNames = [...new Set(
    sortRecords(records)
      .reverse()
      .filter((record) => firstDateByCube.get(record.cubeName) === dateKey)
      .map((record) => record.cubeName),
  )]
  const reactions = getDayReactions(records)

  return {
    categories,
    newFoods: newFoodNames.map((name) => ({
      name,
      reaction: getStrongestReaction(records.filter((record) => record.cubeName === name)),
    })),
    reactions,
  }
}

export function ConsumptionCalendar({
  batches,
  profile,
  records,
  onEditRecord,
  onEditProfile,
}: ConsumptionCalendarProps) {
  const todayKey = getSeoulDateKey(new Date())
  const todayMonth = todayKey.slice(0, 7)
  const [visibleMonth, setVisibleMonth] = useState(todayMonth)
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const activeRecords = useMemo(
    () => records.filter((record) => !record.cancelledAt),
    [records],
  )
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, ConsumptionRecord[]>()
    for (const record of activeRecords) {
      const key = getSeoulDateKey(record.consumedAt)
      grouped.set(key, [...(grouped.get(key) ?? []), record])
    }
    return grouped
  }, [activeRecords])
  const categoryByBatchId = useMemo(
    () => new Map(batches.map((batch) => [batch.id, batch.category])),
    [batches],
  )
  const firstDateByCube = useMemo(() => {
    const firstDates = new Map<string, string>()
    for (const record of activeRecords) {
      const dateKey = getSeoulDateKey(record.consumedAt)
      const current = firstDates.get(record.cubeName)
      if (!current || dateKey < current) firstDates.set(record.cubeName, dateKey)
    }
    return firstDates
  }, [activeRecords])
  const calendarDays = useMemo(() => getMonthDays(visibleMonth), [visibleMonth])
  const selectedRecords = useMemo(
    () => sortRecords(recordsByDate.get(selectedDate) ?? []),
    [recordsByDate, selectedDate],
  )
  const selectedCubeGroups = useMemo(() => groupCubes(selectedRecords), [selectedRecords])
  const selectedCategoryGroups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        records: selectedRecords.filter(
          (record) => (categoryByBatchId.get(record.batchId) ?? 'other') === category,
        ),
      })).filter(({ category, records: categoryRecords }) =>
        category === 'other' ? categoryRecords.length > 0 : true,
      ),
    [categoryByBatchId, selectedRecords],
  )
  const selectedNewFoods = useMemo(() => {
    const names = [...new Set(
      selectedRecords
        .filter((record) => firstDateByCube.get(record.cubeName) === selectedDate)
        .map((record) => record.cubeName),
    )]
    return names.map((name) => {
      const foodRecords = selectedRecords.filter((record) => record.cubeName === name)
      return { name, reaction: getStrongestReaction(foodRecords) }
    })
  }, [firstDateByCube, selectedDate, selectedRecords])
  const monthRecords = useMemo(
    () =>
      activeRecords.filter(
        (record) => getSeoulDateKey(record.consumedAt).slice(0, 7) === visibleMonth,
      ),
    [activeRecords, visibleMonth],
  )
  const monthWatchCount = useMemo(
    () => monthRecords.filter((record) => record.reaction === 'watch').length,
    [monthRecords],
  )

  const moveMonth = (amount: number) => {
    const nextMonth = shiftMonth(visibleMonth, amount)
    setVisibleMonth(nextMonth)
    setSelectedDate(nextMonth === todayMonth ? todayKey : `${nextMonth}-01`)
  }

  const selectDay = (key: string) => {
    setSelectedDate(key)
    if (key.slice(0, 7) !== visibleMonth) setVisibleMonth(key.slice(0, 7))
  }

  const goToday = () => {
    setVisibleMonth(todayMonth)
    setSelectedDate(todayKey)
  }

  return (
    <section className="consumption-calendar" aria-labelledby="consumption-calendar-title">
      <header className="consumption-calendar__header">
        <div>
          <span className="eyebrow">달력으로 한눈에</span>
          <h1 id="consumption-calendar-title">먹은 기록 달력</h1>
        </div>
        <div className="consumption-calendar__actions">
          <button className="consumption-calendar__profile" onClick={onEditProfile} type="button">
            <Icon name="edit" size={14} />
            아기 날짜
          </button>
          <button
            aria-current={selectedDate === todayKey ? 'date' : undefined}
            className="consumption-calendar__today"
            onClick={goToday}
            type="button"
          >
            오늘
          </button>
        </div>
      </header>

      {!profile.birthDate && !profile.weaningStartedOn && (
        <button className="baby-timeline-prompt" onClick={onEditProfile} type="button">
          <span aria-hidden="true"><Icon name="calendar" size={19} /></span>
          <span>
            <strong>D+와 이유식 일차도 같이 볼까요?</strong>
            <small>생일과 시작일은 한 번만 설정하면 돼요.</small>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      )}

      <div className="month-calendar">
        <div className="month-calendar__navigation">
          <button
            aria-label="이전 달 보기"
            className="icon-button month-calendar__previous"
            onClick={() => moveMonth(-1)}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
          <div aria-live="polite">
            <strong>{formatMonthHeading(visibleMonth)}</strong>
            <span>
              {monthRecords.length > 0 ? `${monthRecords.length}개 먹음` : '기록 없음'}
              {monthWatchCount > 0 && ` · 관찰 ${monthWatchCount}개`}
            </span>
          </div>
          <button
            aria-label="다음 달 보기"
            className="icon-button"
            onClick={() => moveMonth(1)}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>

        <div className="month-calendar__weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div
          className="month-calendar__grid"
          role="group"
          aria-label={`${formatMonthHeading(visibleMonth)} 날짜 선택`}
        >
          {calendarDays.map((date) => {
            const key = formatDateKey(date)
            const babyAge = getBabyAgeDays(key, profile)
            const dayRecords = recordsByDate.get(key) ?? []
            const daySummary = buildCalendarDaySummary(
              dayRecords,
              categoryByBatchId,
              firstDateByCube,
              key,
            )
            const hasWatch = daySummary.reactions.some(([reaction]) => reaction === 'watch')
            const inMonth = key.slice(0, 7) === visibleMonth
            const isToday = key === todayKey
            const isSelected = key === selectedDate
            const showDaySheet = inMonth && dayRecords.length > 0
            const categorySummary = daySummary.categories
              .filter(({ groups }) => groups.length > 0)
              .map(({ category, groups }) =>
                `${CATEGORY_META[category].label} ${groups
                  .map(({ name, count }) => `${name} ${count}개`)
                  .join(', ')}`,
              )
            const spokenSummary =
              dayRecords.length === 0
                ? '먹은 기록 없음'
                : [
                    `${dayRecords.length}개 기록`,
                    babyAge !== null ? `D+${babyAge}` : null,
                    hasWatch ? '관찰 필요 기록 있음' : null,
                    ...categorySummary,
                    daySummary.newFoods.length > 0
                      ? `새 음식 ${daySummary.newFoods.map(({ name }) => name).join(', ')}`
                      : null,
                    `먹은 양 ${getAmountSummary(dayRecords)}`,
                    getSpokenReactionSummary(daySummary.reactions, dayRecords.length),
                  ].filter(Boolean).join(', ')

            return (
              <button
                aria-label={`${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일, ${spokenSummary}`}
                aria-pressed={isSelected}
                className={[
                  'month-day',
                  !inMonth && 'is-outside',
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                  showDaySheet && 'has-records',
                  showDaySheet && daySummary.newFoods.length > 0 && 'has-new',
                  showDaySheet && hasWatch && 'has-watch',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={key}
                onClick={() => selectDay(key)}
                type="button"
              >
                <span className="month-day__date-line">
                  <span className="month-day__number">{date.getUTCDate()}</span>
                  {babyAge !== null && <small>D+{babyAge}</small>}
                </span>

                {showDaySheet && (
                  <span className="month-day__sheet" aria-hidden="true">
                    <span className="month-day__categories">
                      {daySummary.categories.map(({ category, groups }) => (
                        <span
                          className={`month-day__category is-${category}`}
                          key={category}
                        >
                          <i>{CATEGORY_META[category].label}</i>
                          <span>
                            {groups.length === 0 ? (
                              <b className="is-empty">—</b>
                            ) : (
                              <>
                                {groups.slice(0, 2).map((group) => {
                                  const reaction = getStrongestReaction(group.records)
                                  return (
                                    <b className={group.hasWatch ? 'has-watch' : ''} key={group.name}>
                                      {group.name}
                                      {reaction && (
                                        <i
                                          className={`month-day__category-reaction is-${reaction}`}
                                          title={`${group.name} · ${REACTION_META[reaction].label}`}
                                        >
                                          {REACTION_META[reaction].symbol}
                                        </i>
                                      )}
                                      {group.count > 1 && <small>×{group.count}</small>}
                                    </b>
                                  )
                                })}
                                {groups.length > 2 && <small>+{groups.length - 2}</small>}
                              </>
                            )}
                          </span>
                        </span>
                      ))}
                    </span>

                    {daySummary.newFoods.length > 0 && (
                      <span className="month-day__new">
                        <strong>NEW</strong>
                        <span className="month-day__new-foods">
                          {daySummary.newFoods.map(({ name, reaction }) => (
                            <span
                              className={reaction === 'watch' ? 'has-watch' : ''}
                              key={name}
                              title={`${name} · ${reaction ? REACTION_META[reaction].label : '반응 미기록'}`}
                            >
                              <b>{name}</b>
                              <small className={reaction ? `is-${reaction}` : 'is-empty'}>
                                {reaction && <i>{REACTION_META[reaction].symbol}</i>}
                                {reaction ? REACTION_META[reaction].shortLabel : '미기록'}
                              </small>
                            </span>
                          ))}
                        </span>
                      </span>
                    )}

                    <span className="month-day__result">
                      <span className="month-day__amount">
                        <small>먹은 양</small>
                        <b>{getAmountSummary(dayRecords)}</b>
                      </span>
                      <span className="month-day__reactions">
                        <em>반응</em>
                        {daySummary.reactions.length > 0 ? (
                          daySummary.reactions.map(([reaction, count]) => (
                            <small className={`is-${reaction}`} key={reaction}>
                              <i>{REACTION_META[reaction].symbol}</i>
                              {REACTION_META[reaction].shortLabel}
                              {count > 1 && `×${count}`}
                            </small>
                          ))
                        ) : (
                          <small className="is-empty">—</small>
                        )}
                      </span>
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <section className="calendar-detail" aria-labelledby="calendar-detail-title">
        <header className="calendar-detail__header">
          <div>
            <span>{selectedDate === todayKey ? '오늘' : '선택한 날'}</span>
            <h3 id="calendar-detail-title">{formatDateHeading(selectedDate)}</h3>
            {(getBabyAgeDays(selectedDate, profile) !== null ||
              getWeaningDay(selectedDate, profile) !== null) && (
              <small className="calendar-detail__timeline">
                {[
                  getBabyAgeDays(selectedDate, profile) !== null
                    ? `D+${getBabyAgeDays(selectedDate, profile)}`
                    : null,
                  getWeaningDay(selectedDate, profile) !== null
                    ? `이유식 ${getWeaningDay(selectedDate, profile)}일차`
                    : null,
                ].filter(Boolean).join(' · ')}
              </small>
            )}
          </div>
          <b>{selectedRecords.length}개</b>
        </header>

        {selectedRecords.length === 0 ? (
          <div className="calendar-empty">
            <span aria-hidden="true">
              <Icon name="bowl" size={25} />
            </span>
            <strong>
              {activeRecords.length === 0
                ? '아직 먹은 기록이 없어요'
                : '이 날은 먹은 기록이 없어요'}
            </strong>
            <p>
              {activeRecords.length === 0
                ? '냉동실이나 식단에서 먹었어요를 누르면 달력에 표시돼요.'
                : '기록이 있는 다른 날짜를 골라보세요.'}
            </p>
          </div>
        ) : (
          <>
            <section className="daily-food-sheet" aria-labelledby="daily-food-sheet-title">
              <header>
                <div>
                  <span>오늘의 식단표</span>
                  <h4 id="daily-food-sheet-title">먹은 내용 한눈에 보기</h4>
                </div>
                <strong>{getAmountSummary(selectedRecords)}</strong>
              </header>

              <dl className="daily-food-sheet__rows">
                {selectedCategoryGroups.map(({ category, records: categoryRecords }) => (
                  <div className={`daily-food-sheet__row is-${category}`} key={category}>
                    <dt>
                      <i aria-hidden="true">{CATEGORY_META[category].symbol}</i>
                      {CATEGORY_META[category].label}
                    </dt>
                    <dd>
                      {categoryRecords.length > 0
                        ? groupCubes(categoryRecords)
                            .map((group) => `${group.name} ${group.count}개`)
                            .join(' · ')
                        : '—'}
                    </dd>
                  </div>
                ))}
                <div className="daily-food-sheet__row is-new">
                  <dt><i aria-hidden="true">N</i>NEW</dt>
                  <dd>
                    {selectedNewFoods.length > 0 ? (
                      <span className="daily-food-sheet__new-list">
                        {selectedNewFoods.map(({ name, reaction }) => (
                          <span className={reaction === 'watch' ? 'has-watch' : ''} key={name}>
                            <b>{name}</b>
                            <small>
                              {reaction ? REACTION_META[reaction].label : '반응 미기록'}
                            </small>
                          </span>
                        ))}
                      </span>
                    ) : '—'}
                  </dd>
                </div>
                <div className="daily-food-sheet__row is-amount">
                  <dt><i aria-hidden="true">Σ</i>먹은 양</dt>
                  <dd>{getAmountSummary(selectedRecords)}</dd>
                </div>
              </dl>

              <p className="daily-food-sheet__notice">
                NEW는 이 큐브를 처음 먹은 날이에요. 맛 반응과 몸의 이상 반응은 다를 수 있으니
                걱정되는 모습은 ‘관찰 필요’와 메모로 남겨 주세요. 먹은 양은 기록한 큐브의
                1개 용량을 기준으로 계산해요.
              </p>
            </section>

            <div className="calendar-detail__cube-summary" aria-label="큐브별 먹은 개수">
              {selectedCubeGroups.map((group) => (
                <span className={group.hasWatch ? 'has-watch' : ''} key={group.name}>
                  {group.name} <b>{group.count}개</b>
                  {group.hasWatch && <small>관찰</small>}
                </span>
              ))}
            </div>

            <ol className="calendar-detail__records">
              {selectedRecords.map((record) => {
                const reaction = record.reaction ? REACTION_META[record.reaction] : null
                const hasWatch = record.reaction === 'watch'

                return (
                  <li className={`calendar-record ${hasWatch ? 'has-watch' : ''}`} key={record.id}>
                    <div className="calendar-record__main">
                      <time dateTime={record.consumedAt}>
                        {formatHistoryTime(record.consumedAt)}
                      </time>
                      <div>
                        <strong>{record.cubeName}</strong>
                        <small>{formatUnit(record)}</small>
                      </div>
                      <span
                        className={`calendar-record__reaction ${record.reaction ? `is-${record.reaction}` : 'is-empty'}`}
                      >
                        {reaction ? (
                          <>
                            <i aria-hidden="true">{reaction.symbol}</i>
                            {reaction.label}
                          </>
                        ) : (
                          '반응 미기록'
                        )}
                      </span>
                    </div>

                    {record.reactionNote && (
                      <p className="calendar-record__note">{record.reactionNote}</p>
                    )}

                    <button
                      aria-label={`${record.cubeName} ${formatHistoryTime(record.consumedAt)} 먹은 기록 수정 또는 삭제`}
                      className="calendar-record__edit"
                      onClick={() => onEditRecord(record)}
                      type="button"
                    >
                      <Icon name="edit" size={15} />
                      기록 수정·삭제
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </section>
    </section>
  )
}
