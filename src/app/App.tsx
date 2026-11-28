import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { useTranslate } from '../i18n/index.js'
import { useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll } from './viewport.js'
import { useDrawerGesture } from './useDrawerGesture.js'
import {
  bindChatPersistence,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { ConversationSearch } from '../components/search/ConversationSearch.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { ImageWorkbench } from '../components/media/ImageWorkbench.js'
import { LinkViewer } from '../components/messages/LinkViewer.js'
import { DesktopSider, MobileSider } from '../components/sider/Sider.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'
import { registerBackButton } from './backButton.js'
import styles from './App.module.css'
import { resumeNativeImport } from '../services/chat/backup.js'
import { routeNativeIntents } from '../services/nativeIntentRouter.js'
import { startSyncEngine } from '../services/sync/engine.js'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)

  // 推挤式抽屉：主内容位移与手势所需的 DOM 引用
  const mainRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const sliverHitRef = useRef<HTMLDivElement>(null)
  const siderOpen = useMobileSider((state) => state.open)
  const siderDragging = useMobileSider((state) => state.dragging)
  const siderSettling = useMobileSider((state) => state.settling)
  useDrawerGesture({
    isMobile,
    drawerRef,
    mainRef,
    sliverRef: sliverHitRef,
  })

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])
  // 多端同步：启动、回前台、联网和本地改动后静默同步；未配置时不做任何事。
  useEffect(startSyncEngine, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void resumeNativeImport()
      .catch(() => {})
      .then(initChat)
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  // 桌面快捷方式与系统分享入口：数据库就绪后消费，切回前台再检查一次。
  useEffect(() => {
    if (!ready) {
      return
    }
    let active = true
    const drain = () => {
      if (active) {
        void routeNativeIntents()
      }
    }
    drain()
    window.addEventListener('focus', drain)
    const listener = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            window.dispatchEvent(new Event('deepchat:resume'))
            drain()
          }
        })
      : undefined
    return () => {
      active = false
      window.removeEventListener('focus', drain)
      void listener?.then((handle) => handle.remove())
    }
  }, [ready])

  // 原生返回键逐层关闭浮层（仅 APK 内注册）
  useEffect(registerBackButton, [])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? (
          <MobileSider drawerRef={drawerRef} />
        ) : (
          <DesktopSider collapsed={siderCollapsed} />
        )}
        <main
          ref={mainRef}
          className={clsx(
            styles.main,
            isMobile &&
              (siderOpen || siderDragging || siderSettling) &&
              clsx(styles.mainPushed, siderDragging && styles.mainNoTransition)
          )}
        >
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {isMobile ? null : <CollapsedSider open={siderCollapsed} />}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      {isMobile ? (
        <div
          ref={sliverHitRef}
          className={clsx(
            styles.sliverHit,
            (siderOpen || siderSettling) && !siderDragging && styles.sliverActive
          )}
          aria-hidden={!siderOpen && !siderSettling}
          onClick={closeMobileSider}
        />
      ) : null}
      <ConversationSearch />
      <SettingsDialog />
      <Toast />
      <ImageWorkbench />
      <LinkViewer />
    </>
  )
}
