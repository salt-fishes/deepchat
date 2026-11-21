import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { getDeepSeekBalance } from '../../services/api/balance.js'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { checkLatestRelease, PROJECT_URL, readAppVersion, RELEASES_URL } from '../../services/releases.js'
import { chatFontOffset, setApiKey, setChatFontSize, setSearch, setThinking, setThinkingEffort, useSettings } from '../../services/settings.js'
import { describeReadAloudError, stopReadAloud, toggleReadAloud, useReadAloud } from '../../services/speech/readAloud.js'
import { readChatUsage, subscribeChatUsage } from '../../services/usage.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import styles from './Settings.module.css'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={`${styles.cell} ${styles.row}`}><div className={styles.text}>{label}</div>{children}</div>
)

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
)

const useManualRequest = <T,>() => {
  const [state, setState] = useState<{ busy?: boolean; value?: T; error?: unknown }>({})
  const current = useRef<AbortController>()
  useEffect(() => () => {
    current.current?.abort()
    current.current = undefined
  }, [])
  const run = useCallback((action: (signal: AbortSignal) => Promise<T>) => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    const timer = window.setTimeout(() => controller.abort('timeout'), 12000)
    setState({ busy: true })
    void action(controller.signal).then((value) => {
      if (!controller.signal.aborted) {setState({ value })}
    }).catch((error: unknown) => {
      if (current.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) {
        setState({ error: error ?? true })
      }
    }).finally(() => window.clearTimeout(timer))
  }, [])
  return { ...state, run }
}

const apiErrorKey = (error: unknown): TranslationKey => {
  if (error instanceof ApiError) {
    if (error.status === 401) {return 'apiKeyInvalid'}
    if (error.status === 403) {return 'settingsApiForbidden'}
    if (error.status === 429) {return 'rateLimited'}
    if (error.kind === 'network') {return 'commonNetworkErrorToast'}
  }
  return 'settingsRequestFailed'
}

export const ApiActions = ({ editing }: { editing: boolean }) => {
  const t = useTranslate()
  const apiKey = useSettings((s) => s.apiKey)
  const [confirm, setConfirm] = useState(false)
  const test = useManualRequest<boolean>()
  return <>
    <Row label={t('settingsConnection')}>
      <Button variant="outlined" disabled={!apiKey || editing || test.busy} onClick={() => apiKey && test.run(async (signal) => {
        await verifyApiKey(apiKey, signal)
        return true
      })}>{t(test.busy ? 'settingsLoading' : 'settingsTest')}</Button>
    </Row>
    {test.error || test.value ? <p className={styles.detailText} role="status">{t(test.error ? apiErrorKey(test.error) : 'settingsConnected')}</p> : null}
    <BalancePanel />
    {apiKey ? <Row label={t('settingsClearKey')}>
      <Button variant="dangerOutlined" disabled={editing} onClick={() => setConfirm(true)}>{t('delete')}</Button>
    </Row> : null}
    {confirm ? <Modal title={t('settingsClearKey')} onClose={() => setConfirm(false)} footer={<>
      <Button variant="outlined" onClick={() => setConfirm(false)}>{t('cancel')}</Button>
      <Button variant="danger" onClick={() => { setConfirm(false); setApiKey(null) }}>{t('delete')}</Button>
    </>}>{t('settingsClearKeyHint')}</Modal> : null}
  </>
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
  return <>
    <Row label={t('settingsBalance')}>
      <Button variant="outlined" disabled={!apiKey || balance.busy} onClick={refresh}>
        {t(balance.busy ? 'settingsLoading' : 'settingsRefresh')}
      </Button>
    </Row>
    <div className={styles.detailText} aria-live="polite">
      {balance.error ? t(apiErrorKey(balance.error)) : balance.value ? <>
        {!balance.value.available ? <p>{t('insufficientBalance')}</p> : null}
        {!balance.value.balances.length ? <p>{t('settingsNoBalance')}</p> : null}
        {balance.value.balances.map((entry, index) => <dl key={`${entry.currency}-${index}`} className={styles.metrics}>
          <dt>{t('settingsTotalBalance')}</dt><dd>{entry.total_balance} {entry.currency}</dd>
          <dt>{t('settingsPaidBalance')}</dt><dd>{entry.topped_up_balance} {entry.currency}</dd>
          <dt>{t('settingsGiftBalance')}</dt><dd>{entry.granted_balance} {entry.currency}</dd>
        </dl>)}
      </> : t(apiKey ? 'settingsLoading' : 'settingsKeyRequired')}
    </div>
  </>
}

export const PersonalizationDefaults = () => {
  const t = useTranslate()
  const thinking = useSettings((s) => s.thinking)
  const search = useSettings((s) => s.search)
  const effort = useSettings((s) => s.thinkingEffort)
  const switchRow = (key: TranslationKey, checked: boolean, set: (checked: boolean) => void) => (
    <Row label={t(key)}><button type="button" className={styles.switch} role="switch" aria-label={t(key)} aria-checked={checked} onClick={() => set(!checked)} /></Row>
  )
  return <>
    {switchRow('settingsDefaultThink', thinking, setThinking)}
    <Row label={t('settingsDefaultEffort')}>
      <Select ariaLabel={t('settingsDefaultEffort')} value={effort} onChange={setThinkingEffort} options={[
        { value: 'low', label: t('effortLow') }, { value: 'high', label: t('effortHigh') }, { value: 'max', label: t('effortMax') },
      ]} />
    </Row>
    {switchRow('settingsDefaultSearch', search, setSearch)}
    <p className={styles.detailText}>{t('settingsDefaultsHint')}</p>
  </>
}

const sizes = [
  ['small', 'settingsFontSmall'], ['default', 'settingsFontDefault'], ['large', 'settingsFontLarge'], ['extraLarge', 'settingsFontExtra'],
] as const

export const FontSettings = () => {
  const t = useTranslate()
  const size = useSettings((s) => s.chatFontSize)
  return <>
    <Row label={t('settingsFont')}><Select ariaLabel={t('settingsFont')} value={size} onChange={setChatFontSize}
      options={sizes.map(([value, key]) => ({ value, label: t(key) }))} /></Row>
    <p className={styles.fontPreview} style={{ fontSize: 16 + chatFontOffset[size] }}>{t('settingsFontPreview')}</p>
  </>
}

const previewId = 'settings:voice-preview'

export const ReadAloudPreview = () => {
  const t = useTranslate()
  const apiKey = useSettings((s) => s.apiKey)
  const status = useReadAloud((s) => s.messageId === previewId ? s.status : null)
  useEffect(() => () => { if (useReadAloud.getState().messageId === previewId) {stopReadAloud()} }, [])
  return <>
    <Row label={t('settingsPreviewVoice')}>
      <Button variant="outlined" disabled={!apiKey} onClick={() => toggleReadAloud(previewId, t('settingsVoiceSample'), (error) => {
        const message = describeReadAloudError(error)
        showToast(typeof message === 'string' ? message : { ...message, type: 'error' })
      })}>{t(status ? 'settingsStopPreview' : 'settingsPreviewVoice')}</Button>
    </Row>
    <p className={styles.detailText}>{t(apiKey ? 'settingsVoiceUsage' : 'settingsKeyRequired')}</p>
  </>
}

export const UpdateSettings = () => {
  const t = useTranslate()
  const [version, setVersion] = useState('')
  const update = useManualRequest<Awaited<ReturnType<typeof checkLatestRelease>>>()
  useEffect(() => {
    let active = true
    void readAppVersion().then(({ label }) => { if (active) {setVersion(label)} }).catch(() => {})
    return () => { active = false }
  }, [])
  const { run } = update
  const check = useCallback(() => run(async (signal) => checkLatestRelease((await readAppVersion()).version, signal)), [run])
  useEffect(check, [check])
  const release = update.value
  return <>
    <Row label={t('settingsCurrentVersion')}><span>{version || '—'}</span></Row>
    <Row label={t('settingsUpdate')}><Button variant="outlined" disabled={update.busy} onClick={check}>{t(update.busy ? 'settingsLoading' : 'settingsUpdate')}</Button></Row>
    <div className={styles.detailText} aria-live="polite">
      {update.error ? t('settingsUpdateFailed') : release?.kind === 'current' ? t('settingsUpToDate') : release?.kind === 'none' ? t('settingsNoRelease') : release?.kind === 'rateLimited' ? t('settingsUpdateRateLimited') : null}
      {release?.kind === 'new' ? <>
        <strong>{t('settingsNewRelease', { version: release.version })}</strong>
        {release.notes ? <p className={styles.releaseNotes}>{release.notes}</p> : null}
        {release.apkUrl ? <p><Link href={release.apkUrl}>{t('settingsDownloadApk')}</Link></p> : null}
        <p><Link href={release.url}>{t('settingsReleasePage')}</Link></p>
      </> : <p><Link href={RELEASES_URL}>{t('settingsReleasePage')}</Link></p>}
    </div>
  </>
}

const periods = [[1, 'settingsToday'], [7, 'settingsLastWeek'], [30, 'settingsLastMonth']] as const

export const UsageSettings = () => {
  const t = useTranslate()
  const locale = useSettings((s) => s.locale)
  const [days, setDays] = useState<1 | 7 | 30>(7)
  const [result, setResult] = useState<{ days: number; usage?: Awaited<ReturnType<typeof readChatUsage>> }>()
  useEffect(() => {
    let active = true
    let revision = 0
    const refresh = () => {
      const request = ++revision
      void readChatUsage(days).then((usage) => { if (active && request === revision) {setResult({ days, usage })} })
        .catch(() => { if (active && request === revision) {setResult({ days })} })
    }
    const unsubscribe = subscribeChatUsage(refresh)
    refresh()
    return () => { active = false; unsubscribe() }
  }, [days])
  const usage = result?.days === days ? result.usage : undefined
  const format = new Intl.NumberFormat(locale)
  const token = (value: number, missing: number, requests: number) => missing > 0
    ? missing === requests ? t('settingsNotRecorded') : t('settingsPartialCount', { count: format.format(value), missing })
    : format.format(value)
  const metrics = (row: NonNullable<typeof usage>['totals']) => <dl className={styles.usageMetrics}>
    <div><dt>{t('settingsRequests')}</dt><dd>{format.format(row.requests)}</dd></div>
    <div><dt>{t('settingsInputTokens')}</dt><dd>{token(row.input, row.missingInput, row.requests)}</dd></div>
    <div><dt>{t('settingsOutputTokens')}</dt><dd>{token(row.output, row.missingOutput, row.requests)}</dd></div>
  </dl>
  return <>
    <section className={styles.detailCard}><BalancePanel /></section>
    <section className={styles.usageCard}>
    <div className={styles.periods} role="group" aria-label={t('settingsUsage')}>
      {periods.map(([value, label]) => <Button key={value} variant={value === days ? 'primary' : 'outlined'} aria-pressed={value === days} onClick={() => setDays(value)}>{t(label)}</Button>)}
    </div>
    <div className={styles.detailText} aria-live="polite">
      {usage ? <>
        {metrics(usage.totals)}
        <h3>{t('settingsDailyUsage')}</h3>
        {usage.daily.length ? usage.daily.map((row) => <div className={styles.usageDay} key={row.date}>
          <time dateTime={row.date}>{row.date}</time>{metrics(row)}
        </div>) : <p>{t('settingsNoUsage')}</p>}
      </> : t(result?.days === days ? 'settingsUsageFailed' : 'settingsLoading')}
      <p>{t('settingsUsageHint')}</p>
    </div>
    </section>
  </>
}

export const SettingsInfo = ({ page }: { page: 'terms' | 'help' }) => {
  const t = useTranslate()
  return <div className={styles.detailText}>
    <p>{t(page === 'terms' ? 'settingsTermsText' : 'settingsHelpText')}</p>
    {page === 'terms' ? <>
      <p><Link href={`${PROJECT_URL}/blob/HEAD/LICENSE`}>{t('settingsLicense')}</Link></p>
      <p><Link href="https://platform.deepseek.com/">{t('settingsPlatform')}</Link></p>
    </> : <>
      <p><Link href={PROJECT_URL}>{t('settingsProjectHelp')}</Link></p>
      <p><Link href={`${PROJECT_URL}/issues`}>{t('settingsFeedback')}</Link></p>
    </>}
  </div>
}
