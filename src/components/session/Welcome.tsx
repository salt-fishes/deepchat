import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

const appMark = new URL(
  '../../../android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
  import.meta.url
).href

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const hour = new Date().getHours()
  const mobileGreeting =
    hour < 12 ? 'welcomeMorning' : hour < 18 ? 'welcomeAfternoon' : 'welcomeEvening'
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>
          {isMobile ? (
            <img className={styles.mark} src={appMark} alt="" width={48} height={48} />
          ) : null}
          <span>{t(isMobile ? mobileGreeting : 'welcomeMessageChat250808')}</span>
        </div>
        <ChatInput sessionId={null} />
      </div>
    </div>
  )
}
