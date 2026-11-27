import { useMemo } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { estimateMessageCost, type TokenRate } from '../../services/pricing.js'
import { MessageBottomSheet } from './MessageBottomSheet.js'
import { IconUsageOutline16 } from './MessageIcons.js'
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
  const rateRow = (section: string, detail: string | null, rate: TokenRate) => (
    <div className={styles.usageRate}>
      <div className={styles.usageRateName}>
        <span>{section}</span>
        {detail ? <strong>{detail}</strong> : null}
      </div>
      <div className={styles.usageRateValues}>
        <div>
          <span>{t('usageUnitPrice')}</span>
          <b>{formatUnitPrice(rate.unitPrice, locale)}</b>
        </div>
        <div>
          <span>{t('usageTokens')}</span>
          <b>{number.format(rate.tokens)}</b>
        </div>
        <div>
          <span>{t('usageAmount')}</span>
          <b>{formatCost(rate.amount, locale)}</b>
        </div>
      </div>
    </div>
  )

  const amount = estimate
    ? estimate.totalAmount > 0
      ? formatCost(estimate.totalAmount, locale)
      : '¥0'
    : '—'

  return (
    <MessageBottomSheet
      open={open}
      title={
        <span className={styles.sheetTitleGroup}>
          <span className={styles.sheetHeaderIcon} aria-hidden="true">
            <IconUsageOutline16 />
          </span>
          <span>{t('usageTitle')}</span>
          {estimate ? (
            <span className={styles.usageBadge}>
              {t(estimate.totalAmount > 0 ? 'usageEstimateBadge' : 'usageFree')}
            </span>
          ) : null}
        </span>
      }
      headerAside={<strong className={styles.usageHeaderAmount}>{amount}</strong>}
      onClose={onClose}
    >
      {!estimate ? (
        <div className={styles.usageUnavailable}>{t('usageUnavailable')}</div>
      ) : (
        <>
          <div className={styles.usagePeriod}>
            {t(estimate.period === 'peak' ? 'usageEstimatePeak' : 'usageEstimateOffPeak')}
          </div>
          <div className={styles.usageCard}>
            {rateRow(t('usageInput'), t('usageCacheMiss'), estimate.cacheMiss)}
            {estimate.cacheHit.tokens > 0
              ? rateRow(t('usageInput'), t('usageCacheHit'), estimate.cacheHit)
              : null}
            {rateRow(t('usageOutput'), null, estimate.output)}
          </div>
          <div className={styles.usageContext}>
            <span className={styles.usageContextMark} aria-hidden="true" />
            <span>
              {t('usageContext', {
                percent: estimate.contextPercent.toLocaleString(locale, {
                  maximumFractionDigits: 2,
                }),
              })}
            </span>
          </div>
          <div className={styles.usageDisclaimer}>{t('usageDisclaimer')}</div>
        </>
      )}
    </MessageBottomSheet>
  )
}
