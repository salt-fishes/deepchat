import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { openExternalLink, sanitizeWebUrl } from '../../services/externalLinks.js'
import { closeTopmostModal, registerOverlayToken } from '../base/Modal.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconArrowLeftOutline16, IconRefreshOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { IconExternalOutline16 } from './MessageIcons.js'
import styles from './LinkViewer.module.css'

type LinkRequest = { url: string; title: string }
const LOAD_TIMEOUT = 15_000

/** Web 端内部网页查看器；Android/iOS 外链由原生 Activity 处理，不挂载 iframe。 */
export const LinkViewer = () => {
  const t = useTranslate()
  const [request, setRequest] = useState<LinkRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const loadTimerRef = useRef(0)
  const visible = useExitPresence(request, overlayRef)
  const present = !!visible

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return
    }
    const onOpenLink = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: unknown; title?: unknown }>).detail
      const url = typeof detail?.url === 'string' ? sanitizeWebUrl(detail.url) : null
      if (!url) {
        showToast(t('linkOpenFailed'))
        return
      }
      const title =
        typeof detail.title === 'string' && detail.title.trim() ? detail.title.trim() : url
      setLoading(true)
      setFailed(false)
      setReload(0)
      setRequest({ url, title })
    }
    window.addEventListener('deepchat:open-link', onOpenLink)
    return () => window.removeEventListener('deepchat:open-link', onOpenLink)
  }, [t])

  const close = () => {
    setRequest(null)
  }

  useEffect(() => {
    if (!present) {
      return
    }
    const unregister = registerOverlayToken(close)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeTopmostModal()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      unregister()
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previous
    }
  }, [present])

  useEffect(() => {
    if (!request) {
      return
    }
    setLoading(true)
    setFailed(false)
    loadTimerRef.current = window.setTimeout(() => {
      setLoading(false)
      setFailed(true)
    }, LOAD_TIMEOUT)
    return () => window.clearTimeout(loadTimerRef.current)
  }, [request, reload])

  if (!visible) {
    return null
  }
  const current = request ?? visible
  const openExternal = () => {
    if (!openExternalLink(current.url)) {
      showToast(t('linkOpenFailed'))
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.viewer}
      data-app-exiting={!request || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <header className={styles.header}>
        <IconButton
          className={styles.headerButton}
          tone="primary"
          icon={<IconArrowLeftOutline16 />}
          tooltip={t('close')}
          tooltipPlacement="bottom"
          onClick={close}
        />
        <div className={styles.title} title={current.title}>
          {current.title}
        </div>
        <IconButton
          className={styles.headerButton}
          tone="primary"
          icon={<IconExternalOutline16 />}
          tooltip={t('linkOpenExternal')}
          tooltipPlacement="bottom"
          onClick={openExternal}
        />
      </header>
      <div className={styles.stage}>
        <iframe
          key={`${current.url}-${reload}`}
          className={styles.frame}
          src={current.url}
          title={current.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          onLoad={() => {
            window.clearTimeout(loadTimerRef.current)
            setLoading(false)
            setFailed(false)
          }}
          onError={() => {
            window.clearTimeout(loadTimerRef.current)
            setLoading(false)
            setFailed(true)
          }}
        />
        {loading ? (
          <div className={styles.loading} role="status">
            <span className={styles.loadingBar} aria-hidden="true" />
            {t('linkLoading')}
          </div>
        ) : null}
        {failed ? (
          <div className={styles.error} role="alert">
            <span>{t('linkOpenFailed')}</span>
            <div className={styles.errorActions}>
              <Button size="s" variant="outlined" onClick={() => setReload((value) => value + 1)}>
                <IconRefreshOutline16 />
                {t('retry')}
              </Button>
              <Button size="s" onClick={openExternal}>
                {t('linkOpenExternal')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
