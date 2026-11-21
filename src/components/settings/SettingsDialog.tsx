import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  IconArrowLeftOutline16,
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconLocationOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { regionCodes, getRegionName, provinces, reverseGeocode } from '../../services/location.js'
import { IconButton } from '../base/IconButton.js'
import {
  isChineseBrowser,
  setCompactThinking,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal, registerOverlayToken } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置界面：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 移动端为独立二级页面（右侧滑入覆盖全屏、返回键关闭）；桌面端为居中弹窗、左侧导航
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  const [retained, setRetained] = useState(open)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    surface.inert = !open
    if (open) {
      setRetained(true)
      return
    }
    const animations = surface.getAnimations?.() ?? []
    if (animations.length === 0) {
      setRetained(false)
      return
    }
    let active = true
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (active && !useSettingsDialog.getState().open) {
        setRetained(false)
      }
    })
    return () => {
      active = false
    }
  }, [isMobile, open])

  return open || retained ? (
    <SettingsContent closing={!open} isMobile={isMobile} surfaceRef={surfaceRef} />
  ) : null
}

/** 移动端独立二级页面：右侧滑入覆盖全屏，返回键关闭 */
const SettingsPage = ({
  title,
  closing,
  surfaceRef,
  children,
}: {
  title: string
  closing: boolean
  surfaceRef: RefObject<HTMLDivElement>
  children: ReactNode
}) => {
  const t = useTranslate()
  // 挂载期间（含滑出阶段）占用返回键；确认弹窗后注册，栈顶优先关闭
  useEffect(() => registerOverlayToken(closeSettings), [])
  return createPortal(
    <div ref={surfaceRef} className={clsx(styles.page, closing && styles.pageClosing)}>
      <div className={styles.pageTop}>
        <IconButton
          size="m"
          tone="primary"
          icon={<IconArrowLeftOutline16 />}
          tooltip={t('back')}
          aria-label={t('back')}
          onClick={closeSettings}
        />
        <div className={styles.pageTitle}>{title}</div>
      </div>
      <div className={clsx(styles.dialogMain, styles.pageMain)}>{children}</div>
    </div>,
    document.body
  )
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = ({ closing, isMobile, surfaceRef }: {
  closing: boolean
  isMobile: boolean
  surfaceRef: RefObject<HTMLDivElement>
}) => {
  const t = useTranslate()
  // 打开时按调用方指定的分组选中，之后在界面内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  const body = (
    <>
      <div role="tablist" className={styles.navigation}>
        {sections.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={section === item.value}
            className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
            onClick={() => setSection(item.value)}
          >
            {item.icon}
            {t(item.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={styles.content}>
        {section === 'general' ? (
          <>
            <ThemeSetting />
            <CompactThinkingSetting />
            <LocaleSetting />
            <TtsVoiceSetting />
            <LocationSetting />
          </>
        ) : (
          <>
            <ApiKeyField editor={apiKeyEditor} />
            <ImportHistory historyImport={historyImport} disabled={historyBusy} />
            <ExportHistory disabled={historyBusy} />
            <SettingCell
              label={t('deleteAllSessions')}
              status={null}
              action={
                <Button
                  variant="dangerOutlined"
                  size="m"
                  className={styles.cellButton}
                  disabled={historyBusy}
                  onClick={historyDelete.open}
                >
                  {t('delete')}
                </Button>
              }
            />
            {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
          </>
        )}
      </div>
    </>
  )
  return (
    <>
      {isMobile ? (
        <SettingsPage title={t('settings')} closing={closing} surfaceRef={surfaceRef}>
          {body}
        </SettingsPage>
      ) : (
        <Modal
          overlayRef={surfaceRef}
          closing={closing}
          title={t('settings')}
          closable
          className={styles.dialog}
          mainClassName={styles.dialogMain}
          onClose={() => {
            if (!historyDelete.busy) {
              closeSettings()
            }
          }}
        >
          {body}
        </Modal>
      )}
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const [locating, setLocating] = useState(false)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  /** 浏览器定位 → 反地理编码 → 自动填入省/市（或国家/地区） */
  const detectLocation = async () => {
    if (locating) {
      return
    }
    if (!('geolocation' in navigator)) {
      showToast({ key: 'locationDetectFailed', type: 'error' })
      return
    }
    setLocating(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 15_000,
          maximumAge: 300_000,
        })
      })
      const result = await reverseGeocode(position.coords.latitude, position.coords.longitude)
      if (!result) {
        showToast({ key: 'locationDetectFailed', type: 'error' })
        return
      }
      setLocation(result)
      showToast({ key: 'locationDetected' })
    } catch {
      // 权限拒绝、超时或反查失败
      showToast({ key: 'locationDetectFailed', type: 'error' })
    } finally {
      setLocating(false)
    }
  }

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
          {/* 自动定位：按当前经纬度反查并填入位置信息 */}
          <IconButton
            size="m"
            className={styles.locateButton}
            icon={<IconLocationOutline16 />}
            tooltip={t('settingsLocationDetect')}
            disabled={locating}
            aria-label={t('settingsLocationDetect')}
            onClick={() => void detectLocation()}
          />
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 覆盖导入的二次确认，叠在设置弹窗上 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：左侧标题，右侧浅色 / 深色 / 跟随系统三个并排小图标（与其他设置行一致）。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <SettingCell
      label={label}
      status={null}
      action={
        <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themePreference === option.value}
              aria-label={t(option.label)}
              title={t(option.label)}
              className={clsx(
                styles.themeOption,
                themePreference === option.value && styles.themeOptionSelected
              )}
              onClick={() => setThemePreference(option.value)}
            >
              {option.icon}
            </button>
          ))}
        </div>
      }
    />
  )
}

const CompactThinkingSetting = () => {
  const t = useTranslate()
  const enabled = useSettings((state) => state.compactThinking)
  return (
    <SettingCell
      label={t('compactThinking')}
      description={t('compactThinkingDescription')}
      status={null}
      action={
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('compactThinking')}
          className={styles.switch}
          onClick={() => setCompactThinking(!enabled)}
        />
      }
    />
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status && styles.statusIn, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 选文件后先提示覆盖；确认后才检查文件并执行导入，任何错误都提示导入失败。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    setStatus(null)
    try {
      const count = await importHistory(file)
      setStatus({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, status, select: setFile, cancel: () => setFile(null), confirm }
}

/** 导入 = 覆盖：用选中文件替换本地全部会话与附件。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={historyImport.status}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select(file)
              }
            }}
          />
        </>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}
