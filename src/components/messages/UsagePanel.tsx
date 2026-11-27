import { useMemo, type CSSProperties } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { estimateMessageCost, type TokenRate } from '../../services/pricing.js'
import { MessageBottomSheet } from './MessageBottomSheet.js'
import styles from './MessageInteractions.module.css'

const formatCost = (value: number, locale: string) => {
  if (value > 0 && value < 0.000001) {
    return '<¥0.000001'
  }
  return `¥${value.toLocaleString(locale, { maximumFractionDigits: 6 })}`
}

const formatUnitPrice = (value: number, locale: string) =>
  `¥${value.toLocaleString(locale, { maximumFractionDigits: 3 })}/M`

export const UsagePanel = ({
  open,
  onClose,
  message,
}: {
  open: boolean
  onClose: () => void
  message: AssistantMessageType
}) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const estimate = useMemo(
    () =>
      estimateMessageCost({
        model: message.model,
        usage: message.usage,
        createdAt: message.createdAt,
      }),
    [message.createdAt, message.model, message.usage]
  )
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const row = (label: string, rate: TokenRate) => (
    <tr key={label}>
      <td className={styles.usageRowLabel}>{label}</td>
      <td>{formatUnitPrice(rate.unitPrice, locale)}</td>
      <td>{number.format(rate.tokens)}</td>
      <td>{formatCost(rate.amount, locale)}</td>
    </tr>
  )

  return (
    <MessageBottomSheet open={open} title={t('usageTitle')} onClose={onClose}>
      {!estimate ? (
        <div className={styles.usageUnavailable}>{t('usageUnavailable')}</div>
      ) : (
        <>
          <div className={styles.usageTotal}>
            <span className={styles.usageTotalLabel}>{t('usageAmount')}</span>
            <strong className={styles.usageTotalValue}>
              {estimate.totalAmount > 0 ? formatCost(estimate.totalAmount, locale) : t('usageFree')}
            </strong>
          </div>
          <div className={styles.usagePeriod}>
            {t(estimate.period === 'peak' ? 'usageEstimatePeak' : 'usageEstimateOffPeak')}
          </div>
          <table className={styles.usageTable}>
            <thead>
              <tr>
                <th />
                <th>{t('usageUnitPrice')}</th>
                <th>{t('usageTokens')}</th>
                <th>{t('usageAmount')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.usageSection}>
                <td colSpan={4}>{t('usageInput')}</td>
              </tr>
              {row(t('usageCacheMiss'), estimate.cacheMiss)}
              {estimate.cacheHit.tokens > 0 ? row(t('usageCacheHit'), estimate.cacheHit) : null}
              <tr className={styles.usageSection}>
                <td colSpan={4}>{t('usageOutput')}</td>
              </tr>
              {row(t('usageOutput'), estimate.output)}
            </tbody>
          </table>
          <div className={styles.usageContext}>
            <div className={styles.usageContextText}>
              {t('usageContext', {
                percent: estimate.contextPercent.toLocaleString(locale, {
                  maximumFractionDigits: 2,
                }),
              })}
            </div>
            <div className={styles.usageContextTrack} aria-hidden="true">
              <span
                className={styles.usageContextFill}
                style={{ width: `${estimate.contextPercent}%` } as CSSProperties}
              />
            </div>
          </div>
          <div className={styles.usageDisclaimer}>{t('usageDisclaimer')}</div>
        </>
      )}
    </MessageBottomSheet>
  )
}
