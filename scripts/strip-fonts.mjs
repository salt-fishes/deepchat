// 构建后移除 KaTeX 字体的 woff/ttf 副本，只保留 woff2（构建目标 Chrome 105+ 全部支持）。
// KaTeX CSS 的 @font-face src 列表按 woff2 → woff → ttf 排序，浏览器取第一个可用的 woff2，
// 删除后两种格式可减少约 0.5MB 未压缩体积（GitHub Pages 与 APK 均受益）。
import { readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mediaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/static/media')

let removed = 0
try {
  for (const file of readdirSync(mediaDir)) {
    if (file.startsWith('KaTeX_') && (file.endsWith('.woff') || file.endsWith('.ttf'))) {
      rmSync(path.join(mediaDir, file))
      removed += 1
    }
  }
} catch {
  // dist 尚未生成（单独执行本脚本）时静默跳过
}
console.log(`strip-fonts: removed ${removed} legacy font files`)
