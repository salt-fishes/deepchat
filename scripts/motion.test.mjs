import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { getDrawerMotion, resolveDrawerTarget } from '../src/app/drawerMotion.ts'
import { shouldDismissSheet } from '../src/components/messages/sheetDragPolicy.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('drawer distance and recent fling velocity resolve to the expected target', () => {
  assert.equal(resolveDrawerTarget(0.2, false, 0, 40), false)
  assert.equal(resolveDrawerTarget(0.3, false, 0, 40), true)
  assert.equal(resolveDrawerTarget(0.2, false, 0.6, 24), true)
  assert.equal(resolveDrawerTarget(0.2, false, 0.6, 8), false)
  assert.equal(resolveDrawerTarget(0.8, true, 0, 40), true)
  assert.equal(resolveDrawerTarget(0.7, true, 0, 40), false)
  assert.equal(resolveDrawerTarget(0.8, true, -0.6, 24), false)
})

test('drawer settling stays bounded and finishes faster on a quick flick', () => {
  const slow = getDrawerMotion(0, true, 0, 300)
  const fast = getDrawerMotion(0.1, true, 0.8, 300)
  assert.ok(slow.duration >= 160 && slow.duration <= 320)
  assert.ok(fast.duration >= 160 && fast.duration <= 320)
  assert.ok(fast.duration < slow.duration)
  assert.equal(slow.easing, 'enter')
  assert.equal(getDrawerMotion(1, false, 0, 300).easing, 'exit')
})

test('sheet dismissal uses both a height-aware distance and a downward fling', () => {
  assert.equal(shouldDismissSheet(60, 0, 400), false)
  assert.equal(shouldDismissSheet(100, 0, 400), true)
  assert.equal(shouldDismissSheet(30, 0.6, 400), true)
  assert.equal(shouldDismissSheet(10, 0.6, 400), false)
  assert.equal(shouldDismissSheet(130, 0, 800), false)
  assert.equal(shouldDismissSheet(140, 0, 800), true)
})

test('reduced motion clears delayed CSS animations and transitions', async () => {
  const css = await read('../src/app/global.css')
  assert.match(css, /animation-delay:\s*0\.01ms !important/)
  assert.match(css, /transition-delay:\s*0\.01ms !important/)
})

test('transient message and search surfaces retain an exit presence', async () => {
  const files = [
    '../src/components/messages/MessageActionMenu.tsx',
    '../src/components/messages/SelectionToolbar.tsx',
    '../src/components/search/CitationLink.tsx',
    '../src/components/search/HoverCard.tsx',
    '../src/components/chatInput/ThinkingEffort.tsx',
    '../src/components/base/Tooltip.tsx',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.match(source, /useExitPresence/, file)
    assert.match(source, /data-app-exiting/, file)
  }
})

test('desktop sidebar and settings navigation keep their animated state machines', async () => {
  const sider = await read('../src/components/sider/Sider.tsx')
  const app = await read('../src/app/App.tsx')
  const settings = await read('../src/components/settings/SettingsDialog.tsx')
  assert.match(sider, /export const DesktopSider/)
  assert.match(app, /<DesktopSider collapsed=\{siderCollapsed\}/)
  assert.match(app, /<CollapsedSider open=\{siderCollapsed\}/)
  assert.match(settings, /navigationGenerationRef/)
  assert.match(settings, /element\.animate/)
})

test('drawer and bottom sheet gestures guard cancellation and reduced motion', async () => {
  const drawer = await read('../src/app/useDrawerGesture.ts')
  const sheet = await read('../src/components/messages/MessageBottomSheet.tsx')
  assert.match(drawer, /lostpointercapture/)
  assert.match(drawer, /event\.target !== active\.surface/)
  assert.match(drawer, /gestureEpoch/)
  assert.match(drawer, /setSiderSettling/)
  assert.match(sheet, /shouldDismissSheet/)
  assert.match(sheet, /data-sheet-drag-closing|sheetDragClosing/)
  assert.match(sheet, /prefers-reduced-motion/)
})

test('thinking title fade is limited to the pinned state', async () => {
  const reply = await read('../src/components/messages/ReplyArea.tsx')
  const css = await read('../src/components/messages/ReplyArea.module.css')
  assert.match(reply, /dataset\.stuck/)
  assert.match(css, /data-stuck='true'/)
  assert.match(css, /opacity: 0;/)
})
