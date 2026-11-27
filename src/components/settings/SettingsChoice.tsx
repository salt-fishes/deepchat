import { useId, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { IconChevronDownOutline14, IconChevronRightOutline14 } from '../base/icons.js'
import settingsStyles from './Settings.module.css'
import styles from './SettingsChoice.module.css'

export type SettingsChoiceOption<T extends string> = {
  value: T
  label: string
  lang?: string
}

type ChoiceDialogProps<T extends string> = {
  open: boolean
  draft: T
  title: string
  options: SettingsChoiceOption<T>[]
  icon: ReactNode
  onDraftChange: (value: T) => void
  onClose: () => void
  onConfirm: (value: T) => void
}

/** 语言/外观共用：草稿单选、确认提交，关闭栈由现有 Modal/useExitPresence 提供。 */
const ChoiceDialog = <T extends string>({
  open,
  draft,
  title,
  options,
  icon,
  onDraftChange,
  onClose,
  onConfirm,
}: ChoiceDialogProps<T>) => {
  const t = useTranslate()
  const groupName = useId()
  return (
    <Modal
      open={open}
      title={
        <span className={styles.headerTitle}>
          <span className={styles.headerIcon} aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
      }
      className={styles.dialog}
      onClose={onClose}
      footer={
        <Button
          block
          onClick={() => {
            onConfirm(draft)
            onClose()
          }}
        >
          {t('confirm')}
        </Button>
      }
    >
      <div className={styles.options} role="radiogroup" aria-label={title}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={draft === option.value}
              autoFocus={open && draft === option.value}
              onChange={() => onDraftChange(option.value)}
            />
            <span className={styles.radioMark} aria-hidden="true" />
            <span className={styles.optionLabel} lang={option.lang}>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

/** 二级页行内的当前值选择器。 */
export const SettingsChoice = <T extends string>({
  label,
  title,
  value,
  options,
  icon,
  onConfirm,
}: {
  label: string
  title: string
  value: T
  options: SettingsChoiceOption<T>[]
  icon: ReactNode
  onConfirm: (value: T) => void
}) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const current = options.find((option) => option.value === value) ?? options[0]
  const show = () => {
    setDraft(value)
    setOpen(true)
  }
  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <span className={styles.triggerValue}>{current?.label}</span>
        <IconChevronDownOutline14 />
      </button>
      <ChoiceDialog
        open={open}
        draft={draft}
        title={title}
        options={options}
        icon={icon}
        onDraftChange={setDraft}
        onClose={close}
        onConfirm={onConfirm}
      />
    </>
  )
}

/** 首页整行直接打开确认弹框，保留图标、当前值和右侧箭头。 */
export const SettingsChoiceRow = <T extends string>({
  title,
  value,
  options,
  icon,
  onConfirm,
}: {
  title: string
  value: T
  options: SettingsChoiceOption<T>[]
  icon: ReactNode
  onConfirm: (value: T) => void
}) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const current = options.find((option) => option.value === value) ?? options[0]
  const show = () => {
    setDraft(value)
    setOpen(true)
  }
  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        className={settingsStyles.settingsRow}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <span className={settingsStyles.settingsIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={settingsStyles.rowTitle}>{title}</span>
        <span className={settingsStyles.rowValue}>{current?.label}</span>
        <span className={settingsStyles.rowArrow} aria-hidden="true">
          <IconChevronRightOutline14 />
        </span>
      </button>
      <ChoiceDialog
        open={open}
        draft={draft}
        title={title}
        options={options}
        icon={icon}
        onDraftChange={setDraft}
        onClose={close}
        onConfirm={onConfirm}
      />
    </>
  )
}
