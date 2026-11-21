import { IconMenuOutline20, IconNewChatOutline20, IconStopFill16 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { stopReadAloud, useReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：左侧打开历史记录，右侧开启新对话。 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  const reading = useReadAloud((state) => state.status !== 'idle')
  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      <div key={title} className={styles.title}>{title}</div>
      {reading ? (
        <IconButton
          size="xl"
          tone="primary"
          icon={<IconStopFill16 />}
          aria-label={t('ttsStop')}
          onClick={stopReadAloud}
        />
      ) : null}
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconNewChatOutline20 />}
        aria-label={t('newChat')}
        onClick={newChat}
      />
    </div>
  )
}
