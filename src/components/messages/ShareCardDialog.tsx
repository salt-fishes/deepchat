import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { saveImageFile, shareImageFile } from '../../services/share.js'
import { createShareCardFile, formatShareCardDate } from '../../services/shareCard.js'
import { showToast } from '../base/toastState.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconDownloadOutline16 } from '../base/icons.js'
import { MessageBottomSheet } from './MessageBottomSheet.js'
import { IconShareOutline16 } from './MessageIcons.js'
import styles from './MessageInteractions.module.css'

export const ShareCardDialog = ({
  open,
  text,
  onClose,
}: {
  open: boolean
  text: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>('preparing')
  const [generation, setGeneration] = useState(0)
  const [action, setAction] = useState<'share' | 'save' | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setStatus('preparing')
    setFile(null)
    setUrl(null)
    const excerptedAt = Date.now()
    const date = formatShareCardDate(excerptedAt)
    void createShareCardFile({
      text,
      createdAt: excerptedAt,
      dateLabel: date ? t('shareCardDate', { date }) : '',
      disclaimer: t('shareCardDisclaimer'),
    })
      .then((nextFile) => {
        if (cancelled) {
          return
        }
        objectUrl = URL.createObjectURL(nextFile)
        setFile(nextFile)
        setUrl(objectUrl)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [open, text, generation, t])

  const share = async () => {
    if (!file || action) {
      return
    }
    setAction('share')
    try {
      await shareImageFile(file)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast(t('shareCardFailed'))
      }
    } finally {
      setAction(null)
    }
  }

  const save = async () => {
    if (!file || action) {
      return
    }
    setAction('save')
    try {
      const saved = await saveImageFile(file)
      showToast({ key: saved ? 'shareCardSaved' : 'shareCardFailed' })
    } catch {
      showToast({ key: 'shareCardFailed' })
    } finally {
      setAction(null)
    }
  }

  return (
    <MessageBottomSheet
      open={open}
      title={
        <span className={styles.sheetTitleGroup}>
          <span className={styles.sheetHeaderIcon} aria-hidden="true">
            <IconShareOutline16 />
          </span>
          <span>{t('shareCardTitle')}</span>
        </span>
      }
      headerAside={
        <IconButton
          icon={<IconShareOutline16 />}
          tooltip={t('shareCardShare')}
          tooltipPlacement="bottom"
          disabled={status !== 'ready' || !!action}
          onClick={() => void share()}
        />
      }
      onClose={onClose}
      footer={
        <Button block disabled={status !== 'ready' || !!action} onClick={() => void save()}>
          <IconDownloadOutline16 />
          {action === 'save' ? t('shareCardPreparing') : t('shareCardSave')}
        </Button>
      }
    >
      {status === 'preparing' ? (
        <div className={styles.shareStatus} role="status">
          <span className={styles.shareSpinner} aria-hidden="true" />
          {t('shareCardPreparing')}
        </div>
      ) : status === 'error' ? (
        <div className={styles.shareError} role="alert">
          <span>{t('shareCardFailed')}</span>
          <Button size="s" variant="outlined" onClick={() => setGeneration((value) => value + 1)}>
            {t('retry')}
          </Button>
        </div>
      ) : url ? (
        <div className={styles.sharePreview}>
          <img
            className={styles.shareImage}
            src={url}
            alt={t('shareCardTitle')}
            draggable={false}
          />
        </div>
      ) : null}
    </MessageBottomSheet>
  )
}
