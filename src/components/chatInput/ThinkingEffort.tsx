import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { IconCheckOutline16, IconChevronDownOutline14 } from '../base/icons.js'
import { registerOverlayToken } from '../base/Modal.js'
import {
  setChatPreferences,
  useChatPreferences,
  useSettings,
  type ThinkingEffort,
} from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'
import selectStyles from '../base/Select.module.css'
import styles from './ThinkingEffort.module.css'

/** 深度思考的三档强度；仅深度思考开启时入口可见 */
const EFFORTS: {
  value: ThinkingEffort
  labelKey: 'effortLow' | 'effortHigh' | 'effortMax'
  descKey: 'effortLowDesc' | 'effortHighDesc' | 'effortMaxDesc'
}[] = [
  { value: 'low', labelKey: 'effortLow', descKey: 'effortLowDesc' },
  { value: 'high', labelKey: 'effortHigh', descKey: 'effortHighDesc' },
  { value: 'max', labelKey: 'effortMax', descKey: 'effortMaxDesc' },
]

/** 深度思考药丸右侧的强度箭头：点击弹出向上展开的三档菜单 */
export const ThinkingEffortTrigger = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const override = useChatPreferences((state) => state.get(sessionId)?.thinkingEffort)
  const effort = useSettings((state) => override ?? state.thinkingEffort)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuVisible = useExitPresence(open ? true : null, menuRef)
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(!!menuVisible, { side: 'top', align: 'start', offset: 8, fitVisualViewport: true })
  // Esc 只关菜单，不让外层浮层一起关闭
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })
  useEffect(() => (open ? registerOverlayToken(() => setOpen(false)) : undefined), [open])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={clsx(styles.trigger, open && styles.open)}
        aria-label={t('thinkingEffortAria')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={clsx(styles.arrow, open && styles.arrowUp)}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {menuVisible
        ? createPortal(
            <div
              id={menuId}
              ref={(node) => {
                menuRef.current = floatingRef.current = node
              }}
              className={clsx(selectStyles.menu, styles.menu)}
              data-app-exiting={!open || undefined}
              aria-hidden={!open || undefined}
              style={position ?? { visibility: 'hidden' }}
              role="menu"
              aria-label={t('thinkingEffort')}
            >
              {EFFORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === effort}
                  className={clsx(selectStyles.option, styles.option)}
                  onClick={() => {
                    setOpen(false)
                    setChatPreferences(sessionId, { thinkingEffort: option.value })
                  }}
                >
                  <span className={styles.optionText}>
                    <span>{t(option.labelKey)}</span>
                    <span className={styles.optionDesc}>{t(option.descKey)}</span>
                  </span>
                  {option.value === effort ? <IconCheckOutline16 /> : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
