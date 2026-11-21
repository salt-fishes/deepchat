import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconToastError16 } from './icons.js'
import { useToast } from './toastState.js'
import styles from './Toast.module.css'

export const Toast = () => {
  const t = useTranslate()
  const { id, message } = useToast()
  // 清空后保留最后一条文案 200ms 播放退场动画，期间有新提示则直接替换
  const [display, setDisplay] = useState<{ id: number; message: typeof message } | null>(
    message ? { id, message } : null
  )
  const leaving = !message && display !== null

  useEffect(() => {
    if (message) {
      setDisplay({ id, message })
      return
    }
    const timer = window.setTimeout(() => setDisplay(null), 200)
    return () => window.clearTimeout(timer)
  }, [message, id])

  if (!display?.message) {
    return null
  }
  const shown = display.message
  if (typeof shown === 'string') {
    return (
      <div
        key={display.id}
        className={clsx(styles.toast, leaving && styles.leaving)}
        role="status"
      >
        {shown}
      </div>
    )
  }
  const error = shown.type === 'error'
  return (
    <div
      key={display.id}
      className={clsx(styles.toast, error && styles.error, leaving && styles.leaving)}
      role="status"
    >
      {error ? (
        <span className={styles.icon}>
          <IconToastError16 />
        </span>
      ) : null}
      <span className={styles.content}>
        {t(shown.key, shown.params)}
        {shown.link ? (
          <a className={styles.link} href={shown.link.href} target="_blank" rel="noreferrer">
            {t(shown.link.key)}
          </a>
        ) : null}
      </span>
    </div>
  )
}
