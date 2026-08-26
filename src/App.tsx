import { useCallback, useEffect, useMemo, useState } from 'react'
import { BabyProfileSheet } from './components/BabyProfileSheet'
import { ClosedCubeGroups } from './components/ClosedCubeGroups'
import { ConsumptionCalendar } from './components/ConsumptionCalendar'
import { ConsumptionHistory } from './components/ConsumptionHistory'
import { ConsumptionRecordFormSheet } from './components/ConsumptionRecordFormSheet'
import { CubeCard } from './components/CubeCard'
import { CubeDisposalSheet } from './components/CubeDisposalSheet'
import { CubeFormSheet } from './components/CubeFormSheet'
import { HomeTimeline } from './components/HomeTimeline'
import { Icon } from './components/Icon'
import { IngredientSetupSheet } from './components/IngredientSetupSheet'
import { MealPlanFormSheet } from './components/MealPlanFormSheet'
import { MealPlanner } from './components/MealPlanner'
import { Toast } from './components/Toast'
import { connectRepository } from './data/connectRepository'
import {
  InviteRequiredError,
  type CubeRepository,
  type SyncStatus,
} from './data/repository'
import {
  getExpiryStatus,
  getSeoulDateKey,
  sortCubeBatches,
} from './lib/date'
import {
  deriveLocalIngredientModel,
  EMPTY_INGREDIENT_MODEL,
} from './lib/ingredientModel'
import { getInventorySummary } from './lib/inventorySummary'
import type {
  BabyProfile,
  ConsumptionRecord,
  ConsumptionRecordUpdate,
  CubeBatch,
  CubeDisposal,
  CubeDraft,
  CubeRecipe,
  IngredientModel,
  MealPlanDraft,
  MealPlanItem,
  MealSlot,
} from './types'

type BootState = 'connecting' | 'ready' | 'invite-required' | 'error'
type AppView = 'inventory' | 'calendar' | 'planner' | 'history'
type StockFilter = 'all' | 'available' | 'soon' | 'empty'

interface ToastState {
  message: string
  tone: 'success' | 'error'
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR')
}

export default function App() {
  const [repository, setRepository] = useState<CubeRepository | null>(null)
  const [bootState, setBootState] = useState<BootState>('connecting')
  const [bootError, setBootError] = useState('')
  const [bootAttempt, setBootAttempt] = useState(0)
  const [batches, setBatches] = useState<CubeBatch[]>([])
  const [records, setRecords] = useState<ConsumptionRecord[]>([])
  const [mealPlanItems, setMealPlanItems] = useState<MealPlanItem[]>([])
  const [disposals, setDisposals] = useState<CubeDisposal[]>([])
  const [ingredientModel, setIngredientModel] = useState<IngredientModel>(EMPTY_INGREDIENT_MODEL)
  const [babyProfile, setBabyProfile] = useState<BabyProfile>({
    birthDate: null,
    weaningStartedOn: null,
  })
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<AppView>('inventory')
  const [online, setOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const [editing, setEditing] = useState<CubeBatch | null>(null)
  const [prefillRecipe, setPrefillRecipe] = useState<CubeRecipe | null>(null)
  const [discarding, setDiscarding] = useState<CubeBatch | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [ingredientSetupOpen, setIngredientSetupOpen] = useState(false)
  const [mealPlanFormOpen, setMealPlanFormOpen] = useState(false)
  const [mealPlanInitialDate, setMealPlanInitialDate] = useState(() => getSeoulDateKey(new Date()))
  const [mealPlanInitialSlot, setMealPlanInitialSlot] = useState<MealSlot | undefined>()
  const [recordEditing, setRecordEditing] = useState<ConsumptionRecord | null>(null)
  const [babyProfileOpen, setBabyProfileOpen] = useState(false)
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [pendingPlanIds, setPendingPlanIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'success') => {
    setToast({ message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    setBootState('connecting')
    setBootError('')

    void connectRepository()
      .then((connectedRepository) => {
        if (cancelled) return
        setRepository(connectedRepository)
        setSyncStatus(connectedRepository.mode === 'shared' ? 'connecting' : 'connected')
        setBootState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof InviteRequiredError) {
          setBootState('invite-required')
          return
        }
        setBootState('error')
        setBootError(error instanceof Error ? error.message : '사이트를 준비하지 못했어요.')
      })

    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  const loadData = useCallback(
    async (showLoading = false) => {
      if (!repository) return
      if (showLoading) setLoading(true)
      try {
        const [
          nextBatches,
          nextRecords,
          nextMealPlanItems,
          nextDisposals,
          nextBabyProfile,
          sharedIngredientModel,
        ] = await Promise.all([
          repository.list(),
          repository.listConsumptionRecords(),
          repository.listMealPlanItems(),
          repository.listDisposals?.() ?? Promise.resolve([]),
          repository.getBabyProfile(),
          repository.getIngredientModel?.() ?? Promise.resolve(null),
        ])
        setBatches(sortCubeBatches(nextBatches))
        setRecords(nextRecords)
        setMealPlanItems(nextMealPlanItems)
        setDisposals(nextDisposals)
        setBabyProfile(nextBabyProfile)
        setIngredientModel(
          sharedIngredientModel ?? deriveLocalIngredientModel(nextBatches, nextRecords),
        )
      } catch (error) {
        showToast(error instanceof Error ? error.message : '기록을 불러오지 못했어요.', 'error')
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [repository, showToast],
  )

  useEffect(() => {
    if (!repository) return
    let refreshTimer = 0
    void loadData(true)
    const unsubscribe = repository.subscribe(
      () => {
        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => void loadData(), 80)
      },
      (status) => setSyncStatus(status),
    )

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadData()
    }
    const handleOnline = () => {
      setOnline(true)
      void loadData()
    }
    const handleOffline = () => setOnline(false)

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.clearTimeout(refreshTimer)
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadData, repository])

  const totalQuantity = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.quantity, 0),
    [batches],
  )

  const inventorySummary = getInventorySummary(batches)

  const visibleBatches = useMemo(() => {
    if (stockFilter === 'available') return batches.filter((batch) => batch.quantity > 0)
    if (stockFilter === 'empty') return batches.filter((batch) => batch.quantity === 0)
    if (stockFilter === 'soon') {
      return batches.filter(
        (batch) => batch.quantity > 0 && getExpiryStatus(batch.expiresAt) !== 'fresh',
      )
    }
    return batches
  }, [batches, stockFilter])

  const activeDisposalByBatchId = useMemo(
    () =>
      new Map(
        disposals
          .filter((disposal) => !disposal.cancelledAt)
          .map((disposal) => [disposal.batchId, disposal]),
      ),
    [disposals],
  )

  const editingDisposal = editing ? activeDisposalByBatchId.get(editing.id) ?? null : null

  const editingDeleteBlockedReason = useMemo(() => {
    if (!editing) return null
    if (activeDisposalByBatchId.has(editing.id)) {
      return '폐기 기록이 있는 큐브예요. 폐기 기록을 취소한 뒤 등록 삭제할 수 있어요.'
    }
    if (records.some((record) => record.batchId === editing.id && !record.cancelledAt)) {
      return '먹은 기록이 있는 큐브예요. 먹은 이력을 보존하기 위해 등록 삭제는 막혀 있어요. 남은 재고를 버리려면 폐기를 사용해 주세요.'
    }
    if (mealPlanItems.some((item) => item.batchId === editing.id)) {
      return '식단에 연결된 큐브예요. 식단에서 먼저 빼야 등록 삭제할 수 있어요.'
    }
    return null
  }, [activeDisposalByBatchId, editing, mealPlanItems, records])

  const editingQuantityLockedReason = editingDisposal
    ? `폐기된 수량은 직접 바꿀 수 없어요. 폐기 기록을 취소하면 ${editingDisposal.quantity}개가 복원돼요.`
    : null

  const discardingPendingPlanCount = useMemo(
    () =>
      discarding
        ? mealPlanItems.filter(
            (item) => item.batchId === discarding.id && !item.consumptionRecordId,
          ).length
        : 0,
    [discarding, mealPlanItems],
  )

  const recipesNeedingSetup = useMemo(
    () => ingredientModel.recipes.filter((recipe) => recipe.ingredients.length === 0),
    [ingredientModel.recipes],
  )

  const ingredientSuggestions = useMemo(
    () =>
      [...new Set(
        ingredientModel.recipes.flatMap((recipe) =>
          recipe.ingredients.map((ingredient) => ingredient.name),
        ),
      )].sort((a, b) => a.localeCompare(b, 'ko-KR')),
    [ingredientModel.recipes],
  )

  const replaceBatch = useCallback((updated: CubeBatch) => {
    setBatches((current) =>
      sortCubeBatches(current.map((item) => (item.id === updated.id ? updated : item))),
    )
  }, [])

  const handleConsume = async (batch: CubeBatch) => {
    if (!repository || pendingIds.has(batch.id)) return
    setPendingIds((current) => new Set(current).add(batch.id))
    try {
      const result = await repository.consume(batch.id)
      replaceBatch(result.batch)
      setRecords((current) => [
        result.record,
        ...current.filter((record) => record.id !== result.record.id),
      ])
      showToast(`${batch.name} 1개 먹은 기록을 남겼어요.`)
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '먹은 기록을 남기지 못했어요.', 'error')
      await loadData()
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(batch.id)
        return next
      })
    }
  }

  const handleIncrement = async (batch: CubeBatch) => {
    if (!repository || pendingIds.has(batch.id)) return
    if (batch.quantity === 0) {
      openRemake(batch)
      return
    }
    setPendingIds((current) => new Set(current).add(batch.id))
    try {
      replaceBatch(await repository.incrementQuantity(batch.id))
      showToast(`${batch.name} 1개 더했어요.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '수량을 더하지 못했어요.', 'error')
      await loadData()
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(batch.id)
        return next
      })
    }
  }

  const handleDiscard = async (batch: CubeBatch) => {
    if (!repository?.discard) throw new Error('공유 냉동실에서 폐기 기능을 사용할 수 있어요.')
    if (pendingIds.has(batch.id)) throw new Error('이미 처리 중인 큐브예요.')
    setPendingIds((current) => new Set(current).add(batch.id))
    try {
      const result = await repository.discard(batch.id, batch.updatedAt)
      replaceBatch(result.batch)
      setDisposals((current) => [
        result.disposal,
        ...current.filter((disposal) => disposal.id !== result.disposal.id),
      ])
      showToast(
        result.pendingPlanCount > 0
          ? `${batch.name} ${result.disposal.quantity}개를 폐기했어요. 예정 식단 ${result.pendingPlanCount}건은 그대로 두었어요.`
          : `${batch.name} ${result.disposal.quantity}개를 폐기했어요.`,
      )
      await loadData()
    } catch (error) {
      await loadData()
      throw error
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(batch.id)
        return next
      })
    }
  }

  const handleCancelDisposal = async (batch: CubeBatch, disposal: CubeDisposal) => {
    if (!repository?.cancelDisposal || pendingIds.has(batch.id)) return
    setPendingIds((current) => new Set(current).add(batch.id))
    try {
      const result = await repository.cancelDisposal(disposal.id, batch.updatedAt)
      replaceBatch(result.batch)
      setDisposals((current) => current.filter((item) => item.id !== disposal.id))
      showToast(`${batch.name} 폐기 기록을 취소하고 ${disposal.quantity}개를 복원했어요.`)
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '폐기 기록을 취소하지 못했어요.', 'error')
      await loadData()
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(batch.id)
        return next
      })
    }
  }

  const handleCreateMealPlan = async (draft: MealPlanDraft) => {
    if (!repository) throw new Error('저장소가 아직 준비되지 않았어요.')
    const created = await repository.createMealPlanItems(draft)
    setMealPlanItems((current) => [...current, ...created])
    showToast(`${draft.selections.length}종 · 총 ${created.length}개를 식단에 담았어요.`)
    await loadData()
  }

  const handleCompleteMealPlanItem = async (item: MealPlanItem) => {
    if (!repository || pendingPlanIds.has(item.id)) return
    setPendingPlanIds((current) => new Set(current).add(item.id))
    try {
      const result = await repository.completeMealPlanItem(item.id)
      replaceBatch(result.batch)
      setRecords((current) => [
        result.record,
        ...current.filter((record) => record.id !== result.record.id),
      ])
      setMealPlanItems((current) =>
        current.map((currentItem) =>
          currentItem.id === result.planItem.id ? result.planItem : currentItem,
        ),
      )
      showToast(`${item.cubeName} 1개 먹은 기록을 남겼어요.`)
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '식단을 완료하지 못했어요.', 'error')
      await loadData()
    } finally {
      setPendingPlanIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleRemoveMealPlanItem = async (item: MealPlanItem) => {
    if (!repository || pendingPlanIds.has(item.id)) return
    setPendingPlanIds((current) => new Set(current).add(item.id))
    try {
      await repository.removeMealPlanItem(item.id)
      setMealPlanItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
      showToast(`${item.cubeName} 1개를 식단에서 뺐어요.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '식단에서 빼지 못했어요.', 'error')
      await loadData()
    } finally {
      setPendingPlanIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleSaveConsumptionRecord = async (update: ConsumptionRecordUpdate) => {
    if (!repository || !recordEditing) throw new Error('먹은 기록을 찾지 못했어요.')
    const updated = await repository.updateConsumptionRecord(recordEditing.id, update)
    setRecords((current) =>
      current.map((record) => (record.id === updated.id ? updated : record)),
    )
    showToast(`${updated.cubeName} 먹은 기록을 수정했어요.`)
  }

  const handleDeleteConsumptionRecord = async () => {
    if (!repository || !recordEditing) throw new Error('먹은 기록을 찾지 못했어요.')
    const deleting = recordEditing
    const result = await repository.deleteConsumptionRecord(deleting.id)
    if (result.batch) replaceBatch(result.batch)
    setRecords((current) => current.filter((record) => record.id !== deleting.id))
    setMealPlanItems((current) =>
      current.map((item) =>
        item.consumptionRecordId === deleting.id
          ? { ...item, consumptionRecordId: null }
          : item,
      ),
    )
    showToast(
      result.stockRestored
        ? `${deleting.cubeName} 기록을 삭제하고 재고 1개를 복원했어요.`
        : `${deleting.cubeName} 기록을 삭제했어요. 원래 큐브가 없거나 이미 폐기·처리되어 재고는 바뀌지 않았어요.`,
    )
    await loadData()
  }

  const handleSaveBabyProfile = async (profile: BabyProfile) => {
    if (!repository) throw new Error('저장소가 아직 준비되지 않았어요.')
    const updated = await repository.updateBabyProfile(profile)
    setBabyProfile(updated)
    showToast('아기 날짜 정보를 저장했어요.')
  }

  const handleSave = async (draft: CubeDraft) => {
    if (!repository) throw new Error('저장소가 아직 준비되지 않았어요.')
    if (editing) {
      await repository.update(editing.id, draft, editing.updatedAt)
      showToast(`${draft.name} 정보를 수정했어요.`)
    } else {
      await repository.create(draft)
      showToast(`${draft.name} 큐브를 담았어요.`)
    }
    await loadData()
  }

  const handleDelete = async () => {
    if (!repository || !editing) return
    await repository.remove(editing.id, editing.updatedAt)
    showToast(`${editing.name} 큐브 등록을 삭제했어요.`)
    await loadData()
  }

  const handleConfigureLegacyRecipe = async (recipe: CubeRecipe, ingredientNames: string[]) => {
    if (!repository?.configureLegacyRecipe) {
      throw new Error('공유 냉동실에서 기존 재료를 확인할 수 있어요.')
    }
    await repository.configureLegacyRecipe(recipe.id, ingredientNames)
    showToast(`${recipe.name}의 실제 재료를 확인했어요.`)
    await loadData()
  }

  const openCreate = () => {
    setEditing(null)
    setPrefillRecipe(null)
    setFormOpen(true)
  }

  const openEdit = (batch: CubeBatch) => {
    setPrefillRecipe(null)
    setEditing(batch)
    setFormOpen(true)
  }

  const openRemake = (batch: CubeBatch) => {
    const recipe =
      ingredientModel.recipes.find((candidate) => candidate.id === batch.recipeId) ??
      ingredientModel.recipes.find((candidate) => normalized(candidate.name) === normalized(batch.name))

    setEditing(null)
    setPrefillRecipe(
      recipe ?? {
        id: '',
        householdId: batch.householdId,
        name: batch.name,
        category: batch.category,
        defaultUnitAmount: batch.unitAmount,
        defaultUnit: batch.unit,
        ingredients: ingredientModel.batchIngredients[batch.id] ?? [],
      },
    )
    setFormOpen(true)
  }

  const closeCubeForm = () => {
    setFormOpen(false)
    setPrefillRecipe(null)
  }

  const openMealPlanForm = (
    plannedFor = getSeoulDateKey(new Date()),
    mealSlot?: MealSlot,
  ) => {
    setMealPlanInitialDate(plannedFor)
    setMealPlanInitialSlot(mealSlot)
    setMealPlanFormOpen(true)
  }

  if (bootState !== 'ready') {
    return (
      <main className="center-state">
        <img
          alt="이유식 그릇을 안고 있는 아기 곰"
          src={`${import.meta.env.BASE_URL}assets/baby-bear.svg`}
        />
        {bootState === 'connecting' ? (
          <>
            <span className="large-spinner" aria-hidden="true" />
            <h1>냉동실을 살펴보는 중이에요</h1>
          </>
        ) : bootState === 'invite-required' ? (
          <>
            <p className="center-state__eyebrow">기기 연결이 필요해요</p>
            <h1>우리집 기기 연결 링크로 열어 주세요</h1>
            <p>
              일반 브라우저에서 처음 한 번만 연결하면 다음부터는 일반 주소로 바로 들어올 수
              있어요. 시크릿·개인정보 보호 창은 사용하지 마세요.
            </p>
          </>
        ) : (
          <>
            <p className="center-state__eyebrow">잠깐 문제가 생겼어요</p>
            <h1>냉동실을 불러오지 못했어요</h1>
            <p>{bootError}</p>
            <button className="primary-button" onClick={() => setBootAttempt((value) => value + 1)}>
              <Icon name="refresh" />
              다시 시도
            </button>
          </>
        )}
      </main>
    )
  }

  const shared = repository?.mode === 'shared'
  const connectionText = !shared
    ? '이 기기에 저장 중'
    : syncStatus === 'connected'
      ? '함께 동기화 중'
      : syncStatus === 'connecting'
        ? '동기화 연결 중'
        : '동기화 잠시 멈춤'

  return (
    <div className="app-shell">
      <div className="ambient-shape ambient-shape--one" aria-hidden="true" />
      <div className="ambient-shape ambient-shape--two" aria-hidden="true" />

      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="몽글큐브 홈">
          <img alt="" src={`${import.meta.env.BASE_URL}assets/favicon.svg`} />
          <div>
            <strong>몽글큐브</strong>
            <span>우리집 이유식 냉동실</span>
          </div>
        </a>
        {activeView === 'inventory' && (
          <button className="primary-button add-button" onClick={openCreate} type="button">
            <Icon name="plus" />
            <span>큐브 추가</span>
          </button>
        )}
      </header>

      <main>
        {activeView === 'inventory' && (
          <section className="summary-card" aria-labelledby="inventory-summary-title">
            <div className="summary-card__copy">
              <div className="connection-row">
                <span className={`connection-chip ${shared ? `sync-${syncStatus}` : 'is-local'}`}>
                  <Icon name={shared ? 'people' : 'device'} size={15} />
                  {connectionText}
                </span>
                <HomeTimeline dateKey={getSeoulDateKey(new Date())} profile={babyProfile} />
                {!online && <span className="offline-chip">오프라인</span>}
              </div>
              <p id="inventory-summary-title">냉동실에 모두</p>
              <div className="summary-number">
                <strong>{totalQuantity}</strong>
                <span>개</span>
              </div>
              <p className={`next-up next-up--${inventorySummary.kind}`}>
                <Icon name="snowflake" size={17} />
                <span>
                  {inventorySummary.label && <b>{inventorySummary.label}</b>}
                  {inventorySummary.label && ' · '}
                  {inventorySummary.detail}
                </span>
              </p>
            </div>
            <img
              alt=""
              className="summary-card__mascot"
              src={`${import.meta.env.BASE_URL}assets/baby-bear.svg`}
            />
          </section>
        )}

        {!shared && (
          <aside className="local-notice">
            <Icon name="device" size={19} />
            <p>
              <strong>지금은 로컬 시험 모드예요.</strong>
              <span>이 브라우저에만 저장되며, Supabase를 연결하면 여러 기기와 공유됩니다.</span>
            </p>
          </aside>
        )}

        {shared && recipesNeedingSetup.length > 0 && activeView === 'inventory' && (
          <button
            className="ingredient-setup-prompt"
            onClick={() => setIngredientSetupOpen(true)}
            type="button"
          >
            <span aria-hidden="true"><Icon name="check" size={19} /></span>
            <span>
              <strong>기존 큐브의 실제 재료를 확인해 주세요</strong>
              <small>{recipesNeedingSetup.length}개 큐브 종류 · NEW 정확도를 위해 한 번만 확인해요</small>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        )}

        {activeView === 'inventory' ? (
          <>
            <section className="inventory-section" aria-labelledby="inventory-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">먹기 권장 순서대로</span>
                  <h2 id="inventory-title">우리집 큐브</h2>
                </div>
                {batches.length > 0 && <span>{batches.length}가지</span>}
              </div>

              {batches.length > 0 && (
                <div className="stock-filters" aria-label="큐브 재고 필터">
                  {([
                    ['all', '전체'],
                    ['available', '남아 있음'],
                    ['soon', '임박·지남'],
                    ['empty', '재고 없음'],
                  ] as const).map(([value, label]) => (
                    <button
                      aria-pressed={stockFilter === value}
                      key={value}
                      onClick={() => setStockFilter(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="card-skeletons" aria-label="재고를 불러오는 중">
                  <div />
                  <div />
                </div>
              ) : batches.length === 0 ? (
                <div className="empty-state">
                  <img
                    alt="빈 이유식 그릇을 든 아기 곰"
                    src={`${import.meta.env.BASE_URL}assets/empty-cubes.svg`}
                  />
                  <h3>아직 담긴 큐브가 없어요</h3>
                  <p>방금 만든 이유식부터 가볍게 기록해 보세요.</p>
                  <button className="primary-button" onClick={openCreate} type="button">
                    <Icon name="plus" />
                    첫 큐브 등록
                  </button>
                </div>
              ) : visibleBatches.length === 0 ? (
                <div className="filter-empty">
                  <Icon name="snowflake" size={24} />
                  <strong>이 조건의 큐브는 없어요</strong>
                  <button onClick={() => setStockFilter('all')} type="button">전체 보기</button>
                </div>
              ) : stockFilter === 'empty' ? (
                <ClosedCubeGroups
                  batches={visibleBatches}
                  disposals={disposals}
                  onCancelDisposal={handleCancelDisposal}
                  onConsume={handleConsume}
                  onEdit={openEdit}
                  onIncrement={handleIncrement}
                  onRemake={openRemake}
                  pendingIds={pendingIds}
                  recipes={ingredientModel.recipes}
                />
              ) : (
                <div className="cube-list">
                  {visibleBatches.map((batch) => (
                    <CubeCard
                      batch={batch}
                      disposal={activeDisposalByBatchId.get(batch.id) ?? null}
                      key={batch.id}
                      onCancelDisposal={repository?.cancelDisposal ? handleCancelDisposal : undefined}
                      onConsume={handleConsume}
                      onDiscard={repository?.discard ? setDiscarding : undefined}
                      onEdit={openEdit}
                      onIncrement={handleIncrement}
                      onRemake={openRemake}
                      pending={pendingIds.has(batch.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <details className="safety-note">
              <summary>
                <Icon name="snowflake" size={18} />
                보관 기준 보기
                <Icon name="chevron" size={17} />
              </summary>
              <p>
                이 가정은 냉동 14일을 관리 기준으로 사용합니다. 국내 공식 참고는 냉동 7일이며,
                보관 온도나 음식 상태가 의심되면 날짜와 관계없이 폐기해 주세요.
              </p>
            </details>
          </>
        ) : activeView === 'calendar' ? (
          <ConsumptionCalendar
            batches={batches}
            onEditProfile={() => setBabyProfileOpen(true)}
            onEditRecord={setRecordEditing}
            profile={babyProfile}
            recordIngredients={ingredientModel.recordIngredients}
            records={records}
          />
        ) : activeView === 'planner' ? (
          <MealPlanner
            batches={batches}
            items={mealPlanItems}
            loading={loading}
            onAdd={openMealPlanForm}
            onComplete={handleCompleteMealPlanItem}
            onEditRecord={setRecordEditing}
            onRemove={handleRemoveMealPlanItem}
            pendingIds={pendingPlanIds}
            records={records}
          />
        ) : (
          <ConsumptionHistory
            loading={loading}
            onEditRecord={setRecordEditing}
            onShowInventory={() => setActiveView('inventory')}
            records={records}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>오늘도 몽글몽글 잘 먹자</span>
        <span aria-hidden="true">·</span>
        <span>가정용 큐브 기록</span>
      </footer>

      <nav aria-label="주요 화면" className="bottom-nav">
        <button
          aria-current={activeView === 'inventory' ? 'page' : undefined}
          onClick={() => setActiveView('inventory')}
          type="button"
        >
          <Icon name="snowflake" size={21} />
          <span>냉동실</span>
        </button>
        <button
          aria-label="달력"
          aria-current={activeView === 'calendar' ? 'page' : undefined}
          onClick={() => setActiveView('calendar')}
          type="button"
        >
          <Icon name="calendar" size={21} />
          <span>달력</span>
        </button>
        <button
          aria-label="식단"
          aria-current={activeView === 'planner' ? 'page' : undefined}
          onClick={() => setActiveView('planner')}
          type="button"
        >
          <Icon name="calendar" size={21} />
          <span>식단</span>
          {mealPlanItems.filter((item) => !item.consumptionRecordId).length > 0 && (
            <b aria-hidden="true">
              {mealPlanItems.filter((item) => !item.consumptionRecordId).length}
            </b>
          )}
        </button>
        <button
          aria-label="먹은 기록"
          aria-current={activeView === 'history' ? 'page' : undefined}
          onClick={() => setActiveView('history')}
          type="button"
        >
          <Icon name="book" size={21} />
          <span>먹은 기록</span>
          {records.length > 0 && <b aria-hidden="true">{records.length}</b>}
        </button>
      </nav>

      <CubeFormSheet
        deleteBlockedReason={editingDeleteBlockedReason}
        initial={editing}
        initialIngredientNames={
          editing
            ? (ingredientModel.batchIngredients[editing.id] ?? []).map(
                (ingredient) => ingredient.name,
              )
            : []
        }
        ingredientSuggestions={ingredientSuggestions}
        onClose={closeCubeForm}
        onDelete={editing && !editingDeleteBlockedReason ? handleDelete : null}
        onSave={handleSave}
        open={formOpen}
        prefillRecipe={prefillRecipe}
        quantityLockedReason={editingQuantityLockedReason}
        recipes={ingredientModel.recipes}
      />

      <CubeDisposalSheet
        batch={discarding}
        onClose={() => setDiscarding(null)}
        onConfirm={handleDiscard}
        open={Boolean(discarding)}
        pendingPlanCount={discardingPendingPlanCount}
      />

      <IngredientSetupSheet
        onClose={() => setIngredientSetupOpen(false)}
        onSave={handleConfigureLegacyRecipe}
        open={ingredientSetupOpen && recipesNeedingSetup.length > 0}
        recipes={recipesNeedingSetup}
        suggestions={ingredientSuggestions}
      />

      <MealPlanFormSheet
        batches={batches}
        initialDate={mealPlanInitialDate}
        initialMealSlot={mealPlanInitialSlot}
        onClose={() => setMealPlanFormOpen(false)}
        onSave={handleCreateMealPlan}
        open={mealPlanFormOpen}
      />

      <ConsumptionRecordFormSheet
        onClose={() => setRecordEditing(null)}
        onDelete={handleDeleteConsumptionRecord}
        onSave={handleSaveConsumptionRecord}
        open={Boolean(recordEditing)}
        record={recordEditing}
      />

      <BabyProfileSheet
        onClose={() => setBabyProfileOpen(false)}
        onSave={handleSaveBabyProfile}
        open={babyProfileOpen}
        profile={babyProfile}
      />

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  )
}
