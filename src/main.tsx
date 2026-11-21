import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

// KaTeX 体积较大，首帧渲染后再预热，避免拖慢 APK 冷启动（未就绪时公式先显示原文）
// 目标浏览器 chrome >= 105，requestIdleCallback（Chrome 74+）必然可用
window.requestIdleCallback(() => void ensureKatex(), { timeout: 2000 })
