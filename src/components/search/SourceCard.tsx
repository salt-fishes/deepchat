import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { openExternalLink, openInAppLink } from '../../services/externalLinks.js'
import { useSettings } from '../../services/settings.js'
import type { Source } from '../../services/chat/view.js'
import { formatDate } from '../../utils/format.js'
import { showToast } from '../base/toastState.js'
import { IconButton } from '../base/IconButton.js'
import { IconLinkOutline16 } from '../base/icons.js'
import { SiteLogo } from './SiteLogo.js'
import interactionStyles from '../messages/MessageInteractions.module.css'
import { IconExternalOutline16 } from '../messages/MessageIcons.js'
import styles from './SourceCard.module.css'

/** 显示为 YYYY/MM/DD；无法解析的日期原样显示 */
const formatPublishedAt = (value: string | null) => (value ? (formatDate(value, '/') ?? value) : '')

/**
 * 来源卡片有两种形态：
 * - preview：正文引用角标的浮层预览，显式提供网页与默认浏览器入口；
 * - result：搜索结果中的整张可点击卡片。
 */
export const SourceCard = ({
  source,
  className,
  variant = 'result',
  onOpen,
}: {
  source: Source
  className?: string
  variant?: 'preview' | 'result'
  onOpen?: () => void
}) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const date = formatPublishedAt(source.publishedAt)
  const openPage = () => {
    if (openInAppLink(source.url, source.title)) {
      onOpen?.()
    } else {
      showToast(t('linkOpenFailed'))
    }
  }
  const card = (
    <div className={clsx(styles.card, variant === 'result' && styles.resultCard, className)}>
      <div className={styles.meta}>
        <SiteLogo url={source.siteIcon} className={styles.siteIcon} />
        {source.siteName ? <span className={styles.siteName}>{source.siteName}</span> : null}
        {source.siteName && date ? <span className={styles.divider} /> : null}
        {date ? <span className={styles.date}>{date}</span> : null}
      </div>
      <div className={styles.title}>{source.title}</div>
      {source.snippet ? <div className={styles.snippet}>{source.snippet}</div> : null}
      {variant === 'preview' ? (
        <div className={interactionStyles.sourceCardActions}>
          <button type="button" className={interactionStyles.sourceCardButton} onClick={openPage}>
            <IconLinkOutline16 />
            {locale === 'zh-CN' ? '打开网页' : 'Open page'}
          </button>
          <IconButton
            icon={<IconExternalOutline16 />}
            tooltip={locale === 'zh-CN' ? '默认浏览器打开' : 'Open in browser'}
            tooltipPlacement="bottom"
            onClick={() => {
              if (openExternalLink(source.url)) {
                onOpen?.()
              } else {
                showToast(t('linkOpenFailed'))
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )

  return variant === 'result' ? (
    <a
      className={styles.anchor}
      href={source.url}
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault()
        openPage()
      }}
    >
      {card}
    </a>
  ) : (
    card
  )
}
