import { useEffect, useState, type ReactNode } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { readAppVersion } from '../../services/releases.js'
import { useSettings } from '../../services/settings.js'
import { IconChevronRightOutline14, IconDataOutline16, IconLightOutline16 } from '../base/icons.js'
import { navigateSettings, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

export const settingsTitles: Record<SettingsSection, TranslationKey> = {
  general: 'settings', api: 'settingsApiManagement', data: 'settingDialogAsideDataOptionLabel',
  language: 'settingsLocalePreference', appearance: 'settingsAppearance', font: 'settingsFont',
  personalization: 'settingsPersonalization', voice: 'settingsTtsVoice', update: 'settingsUpdate',
  terms: 'settingsTerms', help: 'settingsHelp', usage: 'settingsUsage',
}

const glyphs = {
  api: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 22a9 9 0 0 1 18 0',
  language: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20Z',
  font: 'M1 18 5 9l4 9m-6.5-3h5M12 18l5-13 5 13m-8.5-4h7',
  personalization: 'm10 2 2.6 4.9 5.5.7-3.9 4 1 5.5-5.2-2.5-5 2.5.9-5.5-3.9-4 5.4-.7L10 2Zm7 15 5 5',
  voice: 'M3 9h4l5-5v16l-5-5H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  update: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6m0-10v.1',
  terms: 'M11 22H4V3h12l3 3v5M7 8h8m-8 4h5m-5 4h3m3 5 1-4 6-6 3 3-6 6-4 1Z',
  help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4v.1',
  usage: 'M3 3v18h18M7 16v-4m5 4V8m5 8V5',
}

export const SettingsGroup = ({ label, details, children }: { label?: string; details?: boolean; children: ReactNode }) => (
  <section className={styles.settingsGroup} aria-label={label}>
    {label ? <h2 className={styles.groupLabel}>{label}</h2> : null}
    <div className={details ? styles.detailCard : styles.settingsCard}>{children}</div>
  </section>
)

export const SettingsRow = ({ page, value }: { page: Exclude<SettingsSection, 'general'>; value?: string }) => {
  const t = useTranslate()
  const icon = page === 'data' ? <IconDataOutline16 /> : page === 'appearance' ? <IconLightOutline16 /> : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={glyphs[page]} />
    </svg>
  )
  return (
    <button type="button" className={styles.settingsRow} onClick={() => navigateSettings(page)}>
      <span className={styles.settingsIcon} aria-hidden="true">{icon}</span>
      <span className={styles.rowTitle}>{t(page === 'api' ? 'settingsAccountManagement' : settingsTitles[page])}</span>
      {value ? <span className={styles.rowValue}>{value}</span> : null}
      {page !== 'voice' ? <span className={styles.rowArrow} aria-hidden="true"><IconChevronRightOutline14 /></span> : null}
    </button>
  )
}

export const SettingsHome = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const theme = useSettings((state) => state.themePreference)
  const [version, setVersion] = useState('')
  useEffect(() => {
    let active = true
    void readAppVersion().then(({ label }) => { if (active) {setVersion(label)} }).catch(() => {})
    return () => { active = false }
  }, [])
  return <>
    <SettingsGroup label={t('settingsAccount')}>
      <SettingsRow page="api" />
      <SettingsRow page="data" />
    </SettingsGroup>
    <SettingsGroup label={t('settingsApplication')}>
      <SettingsRow page="language" value={locale === 'zh-CN' ? '中文 (简体中文)' : 'English'} />
      <SettingsRow page="appearance" value={t(theme === 'system' ? 'settingsSystem' : theme === 'light'
        ? 'avatarMenuSettingsDialogThemeSelectLightOption' : 'avatarMenuSettingsDialogThemeSelectDarkOption')} />
      <SettingsRow page="font" />
      <SettingsRow page="personalization" />
    </SettingsGroup>
    <SettingsGroup label={t('settingsVoice')}><SettingsRow page="voice" /></SettingsGroup>
    <SettingsGroup label={t('settingsAbout')}>
      <SettingsRow page="update" value={version} />
      <SettingsRow page="terms" />
    </SettingsGroup>
    <SettingsGroup><SettingsRow page="help" /></SettingsGroup>
  </>
}
