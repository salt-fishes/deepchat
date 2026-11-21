import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { closeImageViewer, useImageViewer } from '../components/messages/imageViewerState.js'
import { closeTopmostModal } from '../components/base/Modal.js'
import { closeSearchPanel, useSearchPanel } from '../components/search/searchPanelState.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'

/**
 * 原生返回键：自顶向下关闭浮层（图片查看器 → 弹窗 → 搜索面板 → 移动端抽屉），
 * 浮层都关闭时才退出应用。仅在打包的 APK 里生效，Web 端不注册。
 */
export const registerBackButton = () => {
  if (!Capacitor.isNativePlatform()) {
    return undefined
  }
  const handle = App.addListener('backButton', () => {
    if (useImageViewer.getState().image !== null) {
      closeImageViewer()
      return
    }
    if (closeTopmostModal()) {
      return
    }
    if (useSearchPanel.getState().entry !== null) {
      closeSearchPanel()
      return
    }
    if (useMobileSider.getState().open) {
      closeMobileSider()
      return
    }
    void App.exitApp()
  })
  // addListener 返回 Promise<PluginListenerHandle>
  return () => void handle.then((listener) => listener.remove())
}
