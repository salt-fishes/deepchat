import { useState, type FormEvent } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { configureSync, disconnectSync, syncNow } from '../../services/sync/engine.js'
import { SyncRequestError } from '../../services/sync/client.js'
import { parseSyncInput } from '../../services/sync/code.js'
import { useSyncStore } from '../../services/sync/state.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

const errorKey = (error: unknown): TranslationKey => {
  if (error instanceof SyncRequestError) {
    if (error.kind === 'unauthorized') {
      return 'settingsSyncUnauthorized'
    }
    if (error.kind === 'network' || error.kind === 'timeout') {
      return 'settingsSyncNetwork'
    }
  }
  if (error instanceof Error) {
    if (error.message === 'invalid-sync-code') {
      return 'settingsSyncInvalid'
    }
    if (error.message === 'invalid-sync-url') {
      return 'settingsSyncInvalidUrl'
    }
  }
  return 'settingsSyncFailed'
}

const phaseKey = (phase: string, error: string | null): TranslationKey => {
  if (phase === 'syncing') {
    return 'settingsSyncInProgress'
  }
  if (phase === 'error' && error === 'unauthorized') {
    return 'settingsSyncUnauthorized'
  }
  if (phase === 'error' && (error === 'network' || error === 'timeout')) {
    return 'settingsSyncNetwork'
  }
  if (phase === 'error') {
    return 'settingsSyncFailed'
  }
  return 'settingsSyncOn'
}

const formatTime = (value: number, locale: string) =>
  new Date(value).toLocaleString(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const ConnectForm = () => {
  const t = useTranslate()
  const [server, setServer] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)

  const changeCode = (next: string) => {
    setValue(next)
    setError(null)
    // 粘贴完整同步码时自动带出服务器地址，也可以再手动修改。
    const parsed = parseSyncInput(next)
    if (parsed?.url) {
      setServer(parsed.url)
    }
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!value.trim() || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await configureSync(value, server)
      setValue('')
      setServer('')
    } catch (failure) {
      setError(errorKey(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.cell}>
        <div className={styles.apiKey}>
          <label className={styles.label} htmlFor="sync-server">
            {t('settingsSyncServerLabel')}
          </label>
          <div className={styles.apiKeyInput}>
            <input
              id="sync-server"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('settingsSyncServerPlaceholder')}
              value={server}
              onChange={(event) => {
                setServer(event.target.value)
                setError(null)
              }}
            />
          </div>

          <label className={styles.label} htmlFor="sync-code">
            {t('settingsSyncCodeLabel')}
          </label>
          <form className={styles.apiKeyInput} onSubmit={(event) => void submit(event)}>
            <input
              id="sync-code"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={t('settingsSyncCodePlaceholder')}
              value={value}
              onChange={(event) => changeCode(event.target.value)}
            />
            {value.trim() ? (
              <>
                <span className={styles.divider} />
                <button type="submit" className={styles.confirm} disabled={busy}>
                  {busy ? t('settingsSyncConnecting') : t('settingsSyncConnect')}
                </button>
              </>
            ) : null}
          </form>
          {error ? (
            <div className={styles.error} role="alert">
              {t(error)}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.cell}>
        <div className={styles.text}>
          <div className={styles.label}>{t('settingsSyncOffTitle')}</div>
          <div className={styles.description}>{t('settingsSyncOffDescription')}</div>
        </div>
      </div>
    </>
  )
}

const Connected = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const target = useSyncStore((state) => state.target)
  const phase = useSyncStore((state) => state.phase)
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt)
  const lastError = useSyncStore((state) => state.lastError)
  const pending = useSyncStore((state) => state.pending)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <div className={styles.cell}>
        <div className={styles.row}>
          <div className={styles.text}>
            <div className={styles.label}>{t(phaseKey(phase, lastError))}</div>
            <div className={styles.description}>{target?.url}</div>
            <div className={styles.description} role="status" aria-live="polite">
              {lastSyncAt === null
                ? t('settingsSyncWaiting')
                : t('settingsSyncLast', { time: formatTime(lastSyncAt, locale) })}
              {pending > 0 ? ` · ${t('settingsSyncPending', { count: pending })}` : ''}
            </div>
          </div>
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={phase === 'syncing'}
            onClick={() => void syncNow('manual')}
          >
            {phase === 'syncing' ? t('settingsSyncInProgress') : t('settingsSyncNow')}
          </Button>
        </div>
      </div>
      <div className={styles.cell}>
        <div className={styles.row}>
          <div className={styles.text}>
            <div className={styles.label}>{t('settingsSyncScope')}</div>
            <div className={styles.description}>{t('settingsSyncScopeDescription')}</div>
          </div>
        </div>
      </div>
      <div className={styles.cell}>
        <div className={styles.row}>
          <div className={styles.text}>
            <div className={styles.label}>{t('settingsSyncDisconnect')}</div>
            <div className={styles.description}>{t('settingsSyncDisconnectDescription')}</div>
          </div>
          <Button
            variant="dangerOutlined"
            size="m"
            className={styles.cellButton}
            onClick={() => {
              if (confirming) {
                disconnectSync()
                setConfirming(false)
              } else {
                setConfirming(true)
              }
            }}
            onBlur={() => setConfirming(false)}
          >
            {confirming ? t('settingsSyncDisconnectConfirm') : t('settingsSyncDisconnect')}
          </Button>
        </div>
      </div>
    </>
  )
}

/** 设置 → 多端同步：粘贴一次同步码，之后静默增量同步。 */
export const SyncSettings = () => {
  const configured = useSyncStore((state) => state.target !== null)
  return configured ? <Connected /> : <ConnectForm />
}
