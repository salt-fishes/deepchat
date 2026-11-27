import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  IconArrowLeftOutline16,
  IconDarkOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconGlobeLanguageOutline14,
  IconLightOutline16,
  IconLocationOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
  type HistoryProgress,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import {
  pickBackup,
  saveBackup,
  savesHistoryNatively,
} from '../../services/chat/history/saveBackup.js'
import { archiveFromFile, type ArchiveSource } from '../../services/chat/history/zipReader.js'
import { useChatStore } from '../../services/chat/store.js'
import { regionCodes, getRegionName, provinces, reverseGeocode } from '../../services/location.js'
import { IconButton } from '../base/IconButton.js'
import {
  isChineseBrowser,
  setCompactThinking,
  setLocalePreference,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type LocalePreference,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal, closeTopmostModal, registerOverlayToken } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { SettingsChoice, type SettingsChoiceOption } from './SettingsChoice.js'
import {
  closeSettings,
  navigateSettings,
  useSettingsDialog,
  type SettingsSection,
} from './settingsDialogState.js'
import { SettingsHome, SettingsGroup, SettingsRow, settingsTitles } from './SettingsHome.js'
import {
  ApiActions,
  FontSettings,
  PersonalizationDefaults,
  ReadAloudPreview,
  UpdateSettings,
  UsageSettings,
  SettingsInfo,
} from './SettingsExtras.js'
import settingsStyles from './Settings.module.css'

const styles: Record<string, string> = settingsStyles

/**
 * 移动端全屏设置，桌面端使用同样的分组与子页面。
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  const historyImport = useHistoryImport()
  const cancelImport = historyImport.cancel
  const historyExport = useHistoryExport()
  const [retained, setRetained] = useState(open)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  useEffect(() => {
    if (!open) {
      cancelImport()
    }
  }, [cancelImport, open])
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
    <SettingsContent
      closing={!open}
      isMobile={isMobile}
      surfaceRef={surfaceRef}
      historyImport={historyImport}
      historyExport={historyExport}
    />
  ) : null
}

/** 移动端独立二级页面：右侧滑入覆盖全屏，返回键关闭 */
const SettingsPage = ({
  title,
  section,
  direction,
  closing,
  surfaceRef,
  onBack,
  children,
}: {
  title: string
  section: SettingsSection
  direction: 'forward' | 'back' | null
  closing: boolean
  surfaceRef: RefObject<HTMLDivElement>
  onBack: () => void
  children: ReactNode
}) => {
  const t = useTranslate()
  const closingRef = useRef(closing)
  closingRef.current = closing
  // 挂载期间（含滑出阶段）占用返回键；确认弹窗后注册，栈顶优先关闭
  const backRef = useRef(onBack)
  backRef.current = onBack
  useEffect(() => registerOverlayToken(() => backRef.current()), [])
  useEffect(() => {
    const page = surfaceRef.current
    if (!page) {
      return
    }
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = requestAnimationFrame(() => page.focus({ preventScroll: true }))
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeTopmostModal()
        return
      }
      if (closingRef.current || event.key !== 'Tab' || !page.contains(document.activeElement)) {
        return
      }
      const focusable = Array.from(
        page.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      if (document.activeElement === page) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      if (
        previousFocus?.isConnected &&
        !previousFocus.closest('[inert]') &&
        previousFocus.getClientRects().length > 0
      ) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [surfaceRef])
  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className={clsx(styles.page, closing && styles.pageClosing)}
    >
      <div className={styles.pageTop}>
        <IconButton
          size="m"
          tone="primary"
          className={styles.pageBack}
          icon={<IconArrowLeftOutline16 />}
          tooltip={t('back')}
          aria-label={t('back')}
          onClick={onBack}
        />
        <div
          key={section}
          className={styles.pageTitle}
          data-settings-title
          data-direction={direction ?? undefined}
          tabIndex={-1}
        >
          {title}
        </div>
      </div>
      <div className={clsx(styles.dialogMain, styles.pageMain)}>{children}</div>
    </div>,
    document.body
  )
}

const SettingsContent = ({
  closing,
  isMobile,
  surfaceRef,
  historyImport,
  historyExport,
}: {
  closing: boolean
  isMobile: boolean
  surfaceRef: RefObject<HTMLDivElement>
  historyImport: ReturnType<typeof useHistoryImport>
  historyExport: ReturnType<typeof useHistoryExport>
}) => {
  const t = useTranslate()
  const contentRef = useRef<HTMLDivElement>(null)
  const navigationGenerationRef = useRef(0)
  const navigationAnimationsRef = useRef<Animation[]>([])
  const navigatingRef = useRef(false)
  const [navigating, setNavigating] = useState(false)
  const section = useSettingsDialog((state) => state.section)
  const direction = useSettingsDialog((state) => state.direction)
  const navigate = useCallback(
    (target: SettingsSection, nextDirection: 'forward' | 'back' = 'forward') => {
      if (navigatingRef.current) {
        return
      }
      const content = contentRef.current
      const title = surfaceRef.current?.querySelector<HTMLElement>('[data-settings-title]')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const commit = () => {
        navigateSettings(target, nextDirection)
        navigatingRef.current = false
        setNavigating(false)
        requestAnimationFrame(() => {
          surfaceRef.current
            ?.querySelector<HTMLElement>('[data-settings-title]')
            ?.focus({ preventScroll: true })
        })
      }
      if (reducedMotion || !content?.animate || !title?.animate) {
        commit()
        return
      }
      navigatingRef.current = true
      setNavigating(true)
      const generation = ++navigationGenerationRef.current
      const offset = nextDirection === 'forward' ? -24 : 24
      const options = {
        duration: 220,
        easing: 'cubic-bezier(0.4, 0, 0.8, 0.55)',
        fill: 'forwards' as const,
      }
      const animations = [content, title].map((element) => {
        const computed = getComputedStyle(element)
        return element.animate(
          [
            { opacity: computed.opacity, transform: computed.transform },
            { opacity: '0', transform: `translateX(${offset}px)` },
          ],
          options
        )
      })
      navigationAnimationsRef.current = animations
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
        if (navigationGenerationRef.current !== generation) {
          return
        }
        navigationAnimationsRef.current = []
        commit()
      })
    },
    [surfaceRef]
  )
  useEffect(
    () => () => {
      navigationGenerationRef.current++
      navigationAnimationsRef.current.forEach((animation) => animation.cancel())
    },
    []
  )
  useEffect(() => {
    if (!closing) {
      return
    }
    navigationGenerationRef.current++
    navigationAnimationsRef.current.forEach((animation) => animation.cancel())
    navigationAnimationsRef.current = []
    navigatingRef.current = false
    setNavigating(false)
  }, [closing])
  const apiKeyEditor = useApiKeyEditor()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy =
    historyImport.progress !== null ||
    historyExport.progress !== null ||
    historyDelete.busy ||
    replacingHistory
  const back = () => {
    if (historyDelete.busy) {
      return
    }
    if (section === 'general') {
      closeSettings()
    } else {
      navigate(section === 'usage' ? 'data' : 'general', 'back')
    }
  }
  const title = t(settingsTitles[section])
  const pages: Record<Exclude<SettingsSection, 'general'>, ReactNode> = {
    api: (
      <>
        <ApiKeyField editor={apiKeyEditor} />
        {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
        <ApiActions
          key={apiKeyEditor.apiKey}
          editing={apiKeyEditor.showInput || apiKeyEditor.form.verifying}
        />
      </>
    ),
    data: (
      <>
        <ImportHistory historyImport={historyImport} disabled={historyBusy} />
        <ExportHistory historyExport={historyExport} disabled={historyBusy} />
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
        <SettingsRow page="usage" onNavigate={navigate} />
      </>
    ),
    language: <LocaleSetting />,
    appearance: <ThemeSetting />,
    font: <FontSettings />,
    personalization: (
      <>
        <CompactThinkingSetting />
        <PersonalizationDefaults />
        <LocationSetting />
      </>
    ),
    voice: (
      <>
        <TtsVoiceSetting />
        <ReadAloudPreview />
      </>
    ),
    update: <UpdateSettings />,
    terms: <SettingsInfo page="terms" />,
    help: <SettingsInfo page="help" />,
    usage: <UsageSettings />,
  }
  const body = (
    <div key={section} ref={contentRef} className={styles.settingsScroll} aria-busy={navigating}>
      <div className={styles.settingsTransition} data-direction={direction ?? undefined}>
        {section === 'general' ? (
          <SettingsHome onNavigate={navigate} />
        ) : section === 'usage' ? (
          pages.usage
        ) : (
          <SettingsGroup details>{pages[section]}</SettingsGroup>
        )}
      </div>
    </div>
  )
  return (
    <>
      {isMobile ? (
        <SettingsPage
          title={title}
          section={section}
          direction={direction}
          closing={closing}
          surfaceRef={surfaceRef}
          onBack={back}
        >
          {body}
        </SettingsPage>
      ) : (
        <Modal
          surfaceRef={surfaceRef}
          closing={closing}
          title={
            section === 'general' ? (
              <span
                className={styles.desktopTitleText}
                data-settings-title
                data-direction={direction ?? undefined}
                tabIndex={-1}
              >
                {title}
              </span>
            ) : (
              <span className={styles.desktopTitle}>
                <IconButton
                  icon={<IconArrowLeftOutline16 />}
                  tone="primary"
                  aria-label={t('back')}
                  onClick={back}
                />
                <span
                  key={section}
                  className={styles.desktopTitleText}
                  data-settings-title
                  data-direction={direction ?? undefined}
                  tabIndex={-1}
                >
                  {title}
                </span>
              </span>
            )
          }
          closable
          className={styles.dialog}
          mainClassName={styles.dialogMain}
          onClose={back}
        >
          {body}
        </Modal>
      )}
      <ImportConfirm historyImport={historyImport} />
      <DeleteAllConfirm historyDelete={historyDelete} />
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
      open={historyDelete.opened}
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
  const localePreference = useSettings((state) => state.localePreference)
  const options: SettingsChoiceOption<LocalePreference>[] = [
    { value: 'system', label: t('settingsLocaleSystem') },
    { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
    { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
  ]
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <SettingsChoice
          label={t('settingsLocalePreference')}
          title={t('settingsLocalePreference')}
          value={localePreference}
          options={options}
          icon={<IconGlobeLanguageOutline14 />}
          onConfirm={setLocalePreference}
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
  const fileName = useRef('')
  if (historyImport.file) {
    fileName.current = historyImport.file.name
  }
  return (
    <Modal
      open={!!historyImport.file}
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
      <div className={styles.importFileName}>{fileName.current}</div>
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
 * 主题项：点击打开单选确认，确认后才应用，避免误触立即切换全局主题。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('settingsAppearance')
  const options: SettingsChoiceOption<ThemePreference>[] = themeOptions.map(
    ({ value, label: key }) => ({
      value,
      label: t(key),
    })
  )
  const icon = themeOptions.find((option) => option.value === themePreference)?.icon
  return (
    <SettingCell
      label={label}
      status={null}
      action={
        <SettingsChoice
          label={label}
          title={label}
          value={themePreference}
          options={options}
          icon={icon}
          onConfirm={setThemePreference}
        />
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
  progress,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  progress?: HistoryProgress | null
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {progress ? (
          <HistoryProgressBar progress={progress} />
        ) : status || description ? (
          <div
            className={clsx(
              styles.description,
              status && styles.statusIn,
              status?.error && styles.error
            )}
            role={status ? 'status' : undefined}
          >
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

const HistoryProgressBar = ({ progress }: { progress: HistoryProgress }) => {
  const t = useTranslate()
  let label: string
  let value: number | undefined
  switch (progress.phase) {
    case 'opening':
      label = t('historyOpening')
      break
    case 'checking':
      label = t('historyChecking')
      break
    case 'preparing':
      label = t('historyPreparing')
      break
    case 'replacing':
      label = t('historyReplacing')
      break
    case 'choosing':
      label = t('historyChoosingDestination')
      break
    case 'saving':
      value = progress.percent
      label = t('historySaving', { percent: value })
      break
    case 'reading':
    case 'images':
      value = progress.percent
      label = t(progress.phase === 'reading' ? 'historyReading' : 'historyWritingImages', {
        percent: value,
      })
      break
    case 'sessions':
      value = progress.total ? (progress.completed / progress.total) * 100 : undefined
      label = t('historyWritingSessions', { completed: progress.completed, total: progress.total })
      break
  }
  return (
    <div className={styles.description}>
      <div>{label}</div>
      <progress className={styles.historyProgress} aria-label={label} max={100} value={value} />
    </div>
  )
}

/** 选文件后先提示覆盖，确认后检查归档并执行导入。 */
const useHistoryImport = () => {
  const [file, setFile] = useState<ArchiveSource | null>(null)
  const [progress, setProgress] = useState<HistoryProgress | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)
  const cancel = useCallback(() => {
    void file?.close?.().catch(() => {})
    setFile(null)
  }, [file])

  const choose = async () => {
    if (importing.current) {
      return
    }
    importing.current = true
    setProgress({ phase: 'opening' })
    setStatus(null)
    try {
      setFile(await pickBackup())
    } catch (error) {
      setStatus(errorStatus('historyImportFailed', error))
    } finally {
      importing.current = false
      setProgress(null)
    }
  }

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setProgress({ phase: 'checking' })
    setStatus(null)
    try {
      const count = await importHistory(file, setProgress)
      setStatus({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch (error) {
      setStatus(errorStatus('historyImportFailed', error))
    } finally {
      await file.close?.().catch(() => {})
      importing.current = false
      setProgress(null)
    }
  }

  return { file, progress, status, select: setFile, choose, cancel, confirm }
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
      progress={historyImport.progress}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => {
              if (savesHistoryNatively()) {
                void historyImport.choose()
              } else {
                inputRef.current?.click()
              }
            }}
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
                historyImport.select(archiveFromFile(file))
              }
            }}
          />
        </>
      }
    />
  )
}

const useHistoryExport = () => {
  const [progress, setProgress] = useState<HistoryProgress | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const exporting = useRef(false)

  const download = async () => {
    if (exporting.current) {
      return
    }
    exporting.current = true
    setProgress({ phase: 'sessions', completed: 0, total: useChatStore.getState().sessions.length })
    setStatus(null)
    try {
      const { name, blob } = await exportHistory(setProgress)
      if (savesHistoryNatively()) {
        setProgress({ phase: 'choosing' })
        const saved = await saveBackup(name, blob, (percent) =>
          setProgress({ phase: 'saving', percent })
        )
        setStatus({ key: saved ? 'historySaved' : 'historySaveCancelled' })
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setStatus({ key: 'historyDownloadStarted' })
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      exporting.current = false
      setProgress(null)
    }
  }
  return { progress, status, download }
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({
  historyExport,
  disabled,
}: {
  historyExport: ReturnType<typeof useHistoryExport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={historyExport.status}
      progress={historyExport.progress}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || empty}
          onClick={() => void historyExport.download()}
        >
          <IconDownloadOutline16 />
          {t(savesHistoryNatively() ? 'historySave' : 'exportAllDownload')}
        </Button>
      }
    />
  )
}
