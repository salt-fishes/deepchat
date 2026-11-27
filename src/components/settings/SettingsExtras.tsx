import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { getDeepSeekBalance } from '../../services/api/balance.js'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { getSystemFontScale } from '../../services/haptics.js'
import {
  checkLatestRelease,
  PROJECT_URL,
  readAppVersion,
  RELEASES_URL,
} from '../../services/releases.js'
import {
  chatFontOffset,
  chatFontSizeAtStep,
  FONT_SIZE_STANDARD_STEP,
  FONT_SIZE_STEPS,
  fontSizeStep,
  setApiKey,
  setChatFontSize,
  setFontFollowSystem,
  setSearch,
  setSystemFontScale,
  setThinking,
  setThinkingEffort,
  useSettings,
} from '../../services/settings.js'
import {
  describeReadAloudError,
  stopReadAloud,
  toggleReadAloud,
  useReadAloud,
} from '../../services/speech/readAloud.js'
import { readChatUsage, subscribeChatUsage } from '../../services/usage.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import settingsStyles from './Settings.module.css'
import { buildUsageTrend, summarizeUsageAverage, usageTrendLabelIndexes } from './usageModel.js'

const styles: Record<string, string> = settingsStyles

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={`${styles.cell} ${styles.row}`}>
    <div className={styles.text}>{label}</div>
    {children}
  </div>
)

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)

const useManualRequest = <T,>() => {
  const [state, setState] = useState<{ busy?: boolean; value?: T; error?: unknown }>({})
  const current = useRef<AbortController>()
  useEffect(
    () => () => {
      current.current?.abort()
      current.current = undefined
    },
    []
  )
  const run = useCallback((action: (signal: AbortSignal) => Promise<T>) => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    const timer = window.setTimeout(() => controller.abort('timeout'), 12000)
    setState({ busy: true })
    void action(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setState({ value })
        }
      })
      .catch((error: unknown) => {
        if (
          current.current === controller &&
          (!controller.signal.aborted || controller.signal.reason === 'timeout')
        ) {
          setState({ error: error ?? true })
        }
      })
      .finally(() => window.clearTimeout(timer))
  }, [])
  return { ...state, run }
}

const apiErrorKey = (error: unknown): TranslationKey => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'apiKeyInvalid'
    }
    if (error.status === 403) {
      return 'settingsApiForbidden'
    }
    if (error.status === 429) {
      return 'rateLimited'
    }
    if (error.kind === 'network') {
      return 'commonNetworkErrorToast'
    }
  }
  return 'settingsRequestFailed'
}

export const ApiActions = ({ editing }: { editing: boolean }) => {
  const t = useTranslate()
  const apiKey = useSettings((s) => s.apiKey)
  const [confirm, setConfirm] = useState(false)
  const test = useManualRequest<boolean>()
  return (
    <>
      <Row label={t('settingsConnection')}>
        <Button
          variant="outlined"
          disabled={!apiKey || editing || test.busy}
          onClick={() =>
            apiKey &&
            test.run(async (signal) => {
              await verifyApiKey(apiKey, signal)
              return true
            })
          }
        >
          {t(test.busy ? 'settingsLoading' : 'settingsTest')}
        </Button>
      </Row>
      {test.error || test.value ? (
        <p className={styles.detailText} role="status">
          {t(test.error ? apiErrorKey(test.error) : 'settingsConnected')}
        </p>
      ) : null}
      <BalancePanel />
      {apiKey ? (
        <Row label={t('settingsClearKey')}>
          <Button variant="dangerOutlined" disabled={editing} onClick={() => setConfirm(true)}>
            {t('delete')}
          </Button>
        </Row>
      ) : null}
      <Modal
        open={confirm}
        title={t('settingsClearKey')}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button variant="outlined" onClick={() => setConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirm(false)
                setApiKey(null)
              }}
            >
              {t('delete')}
            </Button>
          </>
        }
      >
        {t('settingsClearKeyHint')}
      </Modal>
    </>
  )
}

const BalancePanel = () => {
  const apiKey = useSettings((s) => s.apiKey)
  return <BalanceDetails key={apiKey} apiKey={apiKey} />
}

const BalanceDetails = ({ apiKey }: { apiKey: string | null }) => {
  const t = useTranslate()
  const balance = useManualRequest<Awaited<ReturnType<typeof getDeepSeekBalance>>>()
  const { run } = balance
  const refresh = useCallback(() => {
    if (apiKey) {
      run((signal) => getDeepSeekBalance(apiKey, signal))
    }
  }, [apiKey, run])
  useEffect(refresh, [refresh])
  return (
    <>
      <Row label={t('settingsBalance')}>
        <Button variant="outlined" disabled={!apiKey || balance.busy} onClick={refresh}>
          {t(balance.busy ? 'settingsLoading' : 'settingsRefresh')}
        </Button>
      </Row>
      <div className={styles.detailText} aria-live="polite">
        {balance.error ? (
          t(apiErrorKey(balance.error))
        ) : balance.value ? (
          <>
            {!balance.value.available ? <p>{t('insufficientBalance')}</p> : null}
            {!balance.value.balances.length ? <p>{t('settingsNoBalance')}</p> : null}
            {balance.value.balances.map((entry, index) => (
              <dl key={`${entry.currency}-${index}`} className={styles.metrics}>
                <dt>{t('settingsTotalBalance')}</dt>
                <dd>
                  {entry.total_balance} {entry.currency}
                </dd>
                <dt>{t('settingsPaidBalance')}</dt>
                <dd>
                  {entry.topped_up_balance} {entry.currency}
                </dd>
                <dt>{t('settingsGiftBalance')}</dt>
                <dd>
                  {entry.granted_balance} {entry.currency}
                </dd>
              </dl>
            ))}
          </>
        ) : (
          t(apiKey ? 'settingsLoading' : 'settingsKeyRequired')
        )}
      </div>
    </>
  )
}

export const PersonalizationDefaults = () => {
  const t = useTranslate()
  const thinking = useSettings((s) => s.thinking)
  const search = useSettings((s) => s.search)
  const effort = useSettings((s) => s.thinkingEffort)
  const switchRow = (key: TranslationKey, checked: boolean, set: (checked: boolean) => void) => (
    <Row label={t(key)}>
      <button
        type="button"
        className={styles.switch}
        role="switch"
        aria-label={t(key)}
        aria-checked={checked}
        onClick={() => set(!checked)}
      />
    </Row>
  )
  return (
    <>
      {switchRow('settingsDefaultThink', thinking, setThinking)}
      <Row label={t('settingsDefaultEffort')}>
        <Select
          ariaLabel={t('settingsDefaultEffort')}
          value={effort}
          onChange={setThinkingEffort}
          options={[
            { value: 'low', label: t('effortLow') },
            { value: 'high', label: t('effortHigh') },
            { value: 'max', label: t('effortMax') },
          ]}
        />
      </Row>
      {switchRow('settingsDefaultSearch', search, setSearch)}
      <p className={styles.detailText}>{t('settingsDefaultsHint')}</p>
    </>
  )
}

const fontSizeLabels: TranslationKey[] = [
  'settingsFontSmall',
  'settingsFontSmall',
  'settingsFontDefault',
  'settingsFontLarge',
  'settingsFontExtra',
]

export const FontSettings = () => {
  const t = useTranslate()
  const size = useSettings((s) => s.chatFontSize)
  const followSystem = useSettings((s) => s.fontFollowSystem)
  const systemFontScale = useSettings((s) => s.systemFontScale)
  const step = fontSizeStep(size)
  const hintId = useId()
  const previewScale = followSystem ? systemFontScale : 1
  const previewFontSize = (16 + chatFontOffset[size]) * previewScale

  useEffect(() => {
    if (!followSystem) {
      return
    }
    let active = true
    let request = 0
    const refresh = () => {
      const current = ++request
      void getSystemFontScale()
        .then((scale) => {
          if (active && current === request && useSettings.getState().fontFollowSystem) {
            setSystemFontScale(scale)
          }
        })
        .catch(() => {})
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [followSystem])

  return (
    <section className={styles.fontSettings}>
      <div className={styles.fontPreviewCard}>
        <div className={styles.fontPreviewBubble} style={{ fontSize: previewFontSize }}>
          {t('settingsFontPreviewBubble')}
        </div>
      </div>
      <p id={hintId} className={styles.fontSliderHint}>
        {t('settingsFontSliderHint')}
      </p>
      <p className={styles.fontFeedback}>{t('settingsFontFeedback')}</p>
      <div className={styles.fontControlsCard}>
        <div className={styles.fontFollowRow}>
          <span className={styles.fontFollowLabel}>{t('settingsFontFollowSystem')}</span>
          <button
            type="button"
            className={styles.switch}
            role="switch"
            aria-label={t('settingsFontFollowSystem')}
            aria-checked={followSystem}
            onClick={() => setFontFollowSystem(!followSystem)}
          />
        </div>
        <div className={styles.fontControls}>
          <div className={styles.fontSliderShell}>
            <div className={styles.fontSliderEnds} aria-hidden="true">
              <span className={styles.fontSmallA}>A</span>
              <span className={styles.fontLargeA}>A</span>
            </div>
            <input
              className={styles.fontSlider}
              type="range"
              min={0}
              max={FONT_SIZE_STEPS.length - 1}
              step={1}
              value={step}
              disabled={followSystem}
              aria-label={t('settingsFont')}
              aria-valuetext={t(fontSizeLabels[step])}
              aria-describedby={hintId}
              onChange={(event) => setChatFontSize(chatFontSizeAtStep(Number(event.target.value)))}
            />
            <div className={styles.fontTicks} aria-hidden="true">
              {FONT_SIZE_STEPS.map((value, index) => (
                <span
                  key={value}
                  className={`${styles.fontTick} ${index === step ? styles.fontTickSelected : ''}`}
                >
                  <i />
                  {index === FONT_SIZE_STANDARD_STEP ? <b>{t('settingsFontDefault')}</b> : null}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const previewId = 'settings:voice-preview'

export const ReadAloudPreview = () => {
  const t = useTranslate()
  const apiKey = useSettings((s) => s.apiKey)
  const status = useReadAloud((s) => (s.messageId === previewId ? s.status : null))
  useEffect(
    () => () => {
      if (useReadAloud.getState().messageId === previewId) {
        stopReadAloud()
      }
    },
    []
  )
  return (
    <>
      <Row label={t('settingsPreviewVoice')}>
        <Button
          variant="outlined"
          disabled={!apiKey}
          onClick={() =>
            toggleReadAloud(previewId, t('settingsVoiceSample'), (error) => {
              const message = describeReadAloudError(error)
              showToast(typeof message === 'string' ? message : { ...message, type: 'error' })
            })
          }
        >
          {t(status ? 'settingsStopPreview' : 'settingsPreviewVoice')}
        </Button>
      </Row>
      <p className={styles.detailText}>
        {t(apiKey ? 'settingsVoiceUsage' : 'settingsKeyRequired')}
      </p>
    </>
  )
}

export const UpdateSettings = () => {
  const t = useTranslate()
  const [version, setVersion] = useState('')
  const update = useManualRequest<Awaited<ReturnType<typeof checkLatestRelease>>>()
  useEffect(() => {
    let active = true
    void readAppVersion()
      .then(({ label }) => {
        if (active) {
          setVersion(label)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const { run } = update
  const check = useCallback(
    () => run(async (signal) => checkLatestRelease((await readAppVersion()).version, signal)),
    [run]
  )
  useEffect(check, [check])
  const release = update.value
  return (
    <>
      <Row label={t('settingsCurrentVersion')}>
        <span>{version || '—'}</span>
      </Row>
      <Row label={t('settingsUpdate')}>
        <Button variant="outlined" disabled={update.busy} onClick={check}>
          {t(update.busy ? 'settingsLoading' : 'settingsUpdate')}
        </Button>
      </Row>
      <div className={styles.detailText} aria-live="polite">
        {update.error
          ? t('settingsUpdateFailed')
          : release?.kind === 'current'
            ? t('settingsUpToDate')
            : release?.kind === 'none'
              ? t('settingsNoRelease')
              : release?.kind === 'rateLimited'
                ? t('settingsUpdateRateLimited')
                : null}
        {release?.kind === 'new' ? (
          <>
            <strong>{t('settingsNewRelease', { version: release.version })}</strong>
            {release.notes ? <p className={styles.releaseNotes}>{release.notes}</p> : null}
            {release.apkUrl ? (
              <p>
                <Link href={release.apkUrl}>{t('settingsDownloadApk')}</Link>
              </p>
            ) : null}
            <p>
              <Link href={release.url}>{t('settingsReleasePage')}</Link>
            </p>
          </>
        ) : (
          <p>
            <Link href={RELEASES_URL}>{t('settingsReleasePage')}</Link>
          </p>
        )}
      </div>
    </>
  )
}

const periods = [
  [1, 'settingsToday'],
  [7, 'settingsLastWeek'],
  [30, 'settingsLastMonth'],
] as const
type UsagePeriod = (typeof periods)[number][0]
type ChatUsage = Awaited<ReturnType<typeof readChatUsage>>
type UsageResult = {
  days: UsagePeriod
  status: 'loading' | 'success' | 'error'
  usage?: ChatUsage
}

export const UsageSettings = () => {
  const t = useTranslate()
  const locale = useSettings((s) => s.locale)
  const [days, setDays] = useState<UsagePeriod>(7)
  const [result, setResult] = useState<UsageResult>({ days, status: 'loading' })
  useEffect(() => {
    let active = true
    let revision = 0
    const refresh = () => {
      const request = ++revision
      setResult((current) =>
        current.days === days && current.status === 'loading'
          ? current
          : { days, status: 'loading' }
      )
      void readChatUsage(days)
        .then((usage) => {
          if (active && request === revision) {
            setResult({ days, status: 'success', usage })
          }
        })
        .catch(() => {
          if (active && request === revision) {
            setResult({ days, status: 'error' })
          }
        })
    }
    const unsubscribe = subscribeChatUsage(refresh)
    refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }, [days])

  const current = result.days === days ? result : { days, status: 'loading' as const }
  const usage = current.status === 'success' ? current.usage : undefined
  const integerFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const averageFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const dateFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)
    return dateFormat.format(new Date(year, month - 1, day))
  }
  const tokenMetric = (value: number, missing: number, requests: number) => {
    const unrecorded = requests > 0 && missing === requests
    return {
      value: requests > 0 && !unrecorded ? integerFormat.format(value) : '—',
      note:
        requests === 0 || missing === 0
          ? null
          : unrecorded
            ? t('settingsNotRecorded')
            : t('settingsPartialCount', { count: '', missing: integerFormat.format(missing) }),
    }
  }
  const trend = usage ? buildUsageTrend(usage.daily, days) : []
  const hasRequests = trend.some((row) => row.requests > 0)
  const average = usage ? summarizeUsageAverage(usage.totals) : null
  return (
    <>
      <section className={styles.detailCard}>
        <BalancePanel />
      </section>
      <section className={styles.usageSection}>
        <div className={styles.usageHeader}>
          <h2 className={styles.usageHeading}>{t('settingsUsageOverview')}</h2>
          <div className={styles.usageSegmented} role="group" aria-label={t('settingsUsage')}>
            {periods.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={styles.usagePeriod}
                aria-pressed={value === days}
                onClick={() => setDays(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        {current.status === 'loading' ? (
          <div className={styles.usageLoading} role="status" aria-live="polite">
            <p className={styles.usageStateLabel}>{t('settingsLoading')}</p>
            <div className={styles.usageSkeletonGrid} aria-hidden="true">
              <span className={`${styles.usageSkeleton} ${styles.usageSkeletonPrimary}`} />
              <span className={styles.usageSkeleton} />
              <span className={styles.usageSkeleton} />
              <span className={`${styles.usageSkeleton} ${styles.usageSkeletonWide}`} />
            </div>
          </div>
        ) : current.status === 'error' ? (
          <div className={styles.usageStateCard} role="alert">
            <p className={styles.usageStateLabel}>{t('settingsUsageFailed')}</p>
          </div>
        ) : usage ? (
          <>
            <dl className={styles.usageOverviewGrid}>
              <div className={styles.usagePrimary}>
                <dt>{t('settingsRequests')}</dt>
                <dd>{integerFormat.format(usage.totals.requests)}</dd>
              </div>
              {(
                [
                  ['settingsInputTokens', usage.totals.input, usage.totals.missingInput],
                  ['settingsOutputTokens', usage.totals.output, usage.totals.missingOutput],
                ] as const
              ).map(([label, value, missing]) => {
                const metric = tokenMetric(value, missing, usage.totals.requests)
                return (
                  <div key={label} className={styles.usageMetricCard}>
                    <dt>{t(label)}</dt>
                    <dd>
                      {metric.value}
                      {metric.note ? (
                        <span className={styles.usageMetricNote}>{metric.note}</span>
                      ) : null}
                    </dd>
                  </div>
                )
              })}
              <div className={styles.usageAverageCard}>
                <dt>
                  <span>{t('settingsUsageAveragePerRequest')}</span>
                  {average?.kind === 'partial' ? (
                    <span className={styles.usageAverageNotes}>
                      {average.missingInput > 0 ? (
                        <span>
                          {t('settingsInputTokens')}:{' '}
                          {t('settingsPartialCount', {
                            count: '',
                            missing: integerFormat.format(average.missingInput),
                          })}
                        </span>
                      ) : null}
                      {average.missingOutput > 0 ? (
                        <span>
                          {t('settingsOutputTokens')}:{' '}
                          {t('settingsPartialCount', {
                            count: '',
                            missing: integerFormat.format(average.missingOutput),
                          })}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </dt>
                <dd>
                  {average?.value === null || average?.value === undefined ? (
                    '—'
                  ) : (
                    <>
                      {averageFormat.format(average.value)} <small>Token</small>
                    </>
                  )}
                  {average?.kind === 'unrecorded' ? (
                    <span className={styles.usageMetricNote}>{t('settingsNotRecorded')}</span>
                  ) : null}
                </dd>
              </div>
            </dl>

            {hasRequests ? (
              <>
                <section className={styles.usageTrendCard}>
                  <h3>{t('settingsDailyUsage')}</h3>
                  <div
                    className={styles.usageChart}
                    role="img"
                    aria-label={t('settingsDailyUsage')}
                  >
                    {trend.map((row, index) => (
                      <span
                        key={row.date}
                        className={styles.usageBarColumn}
                        title={`${formatDate(row.date)} · ${t('settingsRequests')} ${integerFormat.format(row.requests)}`}
                      >
                        <span
                          className={styles.usageBar}
                          style={
                            {
                              '--usage-bar-height': `${row.height}%`,
                              animationDelay: `${Math.min(index * 12, 240)}ms`,
                            } as CSSProperties
                          }
                        />
                      </span>
                    ))}
                  </div>
                  <div className={styles.usageChartLabels} aria-hidden="true">
                    {usageTrendLabelIndexes(trend.length).map((index) => (
                      <span key={trend[index].date}>{formatDate(trend[index].date)}</span>
                    ))}
                  </div>
                </section>
                <section className={styles.usageDailyCard}>
                  <h3>{t('settingsDailyUsage')}</h3>
                  <ol className={styles.usageDailyList}>
                    {[...trend].reverse().map((row) => {
                      const input = tokenMetric(row.input, row.missingInput, row.requests)
                      const output = tokenMetric(row.output, row.missingOutput, row.requests)
                      return (
                        <li key={row.date} className={styles.usageDailyRow}>
                          <time dateTime={row.date} className={styles.usageDailyDate}>
                            {formatDate(row.date)}
                          </time>
                          <dl className={styles.usageDailyMetrics}>
                            <div className={styles.usageDailyMetric}>
                              <dt>{t('settingsRequests')}</dt>
                              <dd>{integerFormat.format(row.requests)}</dd>
                            </div>
                            <div className={styles.usageDailyMetric}>
                              <dt>{t('settingsInputTokens')}</dt>
                              <dd>
                                {input.value}
                                {input.note ? (
                                  <span className={styles.usageMetricNote}>{input.note}</span>
                                ) : null}
                              </dd>
                            </div>
                            <div className={styles.usageDailyMetric}>
                              <dt>{t('settingsOutputTokens')}</dt>
                              <dd>
                                {output.value}
                                {output.note ? (
                                  <span className={styles.usageMetricNote}>{output.note}</span>
                                ) : null}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              </>
            ) : (
              <div className={styles.usageEmptyState}>
                <p className={styles.usageStateLabel}>{t('settingsNoUsage')}</p>
              </div>
            )}
          </>
        ) : null}

        <p className={styles.usageHint}>{t('settingsUsageHint')}</p>
      </section>
    </>
  )
}

export const SettingsInfo = ({ page }: { page: 'terms' | 'help' }) => {
  const t = useTranslate()
  return (
    <div className={styles.detailText}>
      <p>{t(page === 'terms' ? 'settingsTermsText' : 'settingsHelpText')}</p>
      {page === 'terms' ? (
        <>
          <p>
            <Link href={`${PROJECT_URL}/blob/HEAD/LICENSE`}>{t('settingsLicense')}</Link>
          </p>
          <p>
            <Link href="https://platform.deepseek.com/">{t('settingsPlatform')}</Link>
          </p>
        </>
      ) : (
        <>
          <p>
            <Link href={PROJECT_URL}>{t('settingsProjectHelp')}</Link>
          </p>
          <p>
            <Link href={`${PROJECT_URL}/issues`}>{t('settingsFeedback')}</Link>
          </p>
        </>
      )}
    </div>
  )
}
