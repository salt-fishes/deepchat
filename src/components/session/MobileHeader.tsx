import { IconMenuOutline20, IconNewChatOutline20, IconSpeaker24 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { stopReadAloud, toggleAutoReadAloud, useAutoReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：左侧打开历史记录，右侧开启新对话。 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  const autoRead = useAutoReadAloud((state) => state.enabled)
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
        <IconButton
          size="xl"
          tone="primary"
          icon={<IconSpeaker24 muted={!autoRead} />}
          aria-label={t('autoReadAloud')}
          aria-pressed={autoRead}
          onClick={toggleAutoReadAloud}
        />
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconNewChatOutline20 />}
        aria-label={t('newChat')}
        onClick={() => { stopReadAloud(); newChat() }}
      />
    </div>
  )
}
