import { useEffect, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import {
  closeMobileSider,
  openMobileSider,
  setSiderDragging,
  useMobileSider,
} from '../components/sider/mobileSiderState.js'

type DrawerGestureOptions = {
  isMobile: boolean
  drawerRef: RefObject<HTMLDivElement | null>
  mainRef: RefObject<HTMLElement | null>
  sliverRef: RefObject<HTMLDivElement | null>
}

const INTENT_DISTANCE = 10
const COMMIT_PROGRESS = 0.3
const FLING_VELOCITY = 0.45
const EDITOR = 'textarea, input, select, [contenteditable]:not([contenteditable="false"])'

export const useDrawerGesture = ({
  isMobile,
  drawerRef,
  mainRef,
  sliverRef,
}: DrawerGestureOptions) => {
  useEffect(() => {
    const drawer = drawerRef.current
    const main = mainRef.current
    const sliver = sliverRef.current
    if (!isMobile || !drawer || !main || !sliver) {
      return
    }

    type Drag = {
      id: number
      surface: HTMLElement
      target: Element
      open: boolean
      width: number
      startX: number
      startY: number
      initialProgress: number
      claimed: boolean
      progress: number
      samples: { x: number; time: number }[]
    }
    let drag: Drag | null = null
    let suppressClick = false
    let frame = 0

    const paint = (progress: number, width: number) => {
      drawer.style.transform = `translateX(${(progress - 1) * 100}%)`
      main.style.transform = `translateX(${progress * width}px) scaleY(${1 - progress * 0.015})`
    }

    const clearTransforms = () => {
      drawer.style.removeProperty('transform')
      main.style.removeProperty('transform')
    }

    const finish = (open: boolean) => {
      const active = drag
      drag = null
      cancelAnimationFrame(frame)
      frame = 0
      if (!active?.claimed) {
        return
      }
      suppressClick = true
      flushSync(() => {
        if (open) {
          openMobileSider()
        } else {
          closeMobileSider()
        }
      })
      clearTransforms()
    }

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary) {
        if (drag) {
          finish(drag.open)
        }
        return
      }
      suppressClick = false
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return
      }
      const target = event.target
      if (!(target instanceof Element) || target.closest(EDITOR)) {
        return
      }
      const open = useMobileSider.getState().open
      const surface = [main, ...(open ? [drawer, sliver] : [])].find((item) =>
        item.contains(target)
      )
      if (!surface || !drawer.offsetWidth) {
        return
      }

      drag = {
        id: event.pointerId,
        surface,
        target,
        open,
        width: drawer.offsetWidth,
        startX: event.clientX,
        startY: event.clientY,
        initialProgress: Number(open),
        claimed: false,
        progress: open ? 1 : 0,
        samples: [{ x: event.clientX, time: event.timeStamp }],
      }
    }

    const track = (active: Drag, event: PointerEvent) => {
      active.samples.push({ x: event.clientX, time: event.timeStamp })
      active.samples = active.samples.filter(({ time }) => event.timeStamp - time <= 100)
      active.progress = Math.max(
        0,
        Math.min(1, active.initialProgress + (event.clientX - active.startX) / active.width)
      )
    }

    const onMove = (event: PointerEvent) => {
      const active = drag
      if (!active || event.pointerId !== active.id) {
        return
      }
      if (!active.claimed) {
        const dx = event.clientX - active.startX
        const dy = event.clientY - active.startY
        if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_DISTANCE) {
          return
        }
        const direction = active.open ? -1 : 1
        const selecting = window.getSelection()?.type === 'Range'
        // 浏览器内的横向滚动区（如宽代码块、附件列表）保留自己的滑动。
        let horizontalScroll = false
        for (
          let element: Element | null = active.target;
          element && element !== active.surface;
          element = element.parentElement
        ) {
          if (
            element.scrollWidth > element.clientWidth + 1 &&
            /auto|scroll/.test(getComputedStyle(element).overflowX)
          ) {
            horizontalScroll = true
            break
          }
        }
        if (dx * direction < Math.abs(dy) * 1.2 || selecting || horizontalScroll) {
          drag = null
          return
        }
        active.claimed = true
        active.surface.setPointerCapture(event.pointerId)
        const transform = getComputedStyle(main).transform
        const currentX = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
        active.initialProgress = Math.max(0, Math.min(1, currentX / active.width))
        paint(active.initialProgress, active.width)
        flushSync(() => setSiderDragging(true))
      }
      track(active, event)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          paint(active.progress, active.width)
        })
      }
    }

    const onUp = (event: PointerEvent) => {
      const active = drag
      if (!active || event.pointerId !== active.id) {
        return
      }
      if (!active.claimed) {
        drag = null
        return
      }
      track(active, event)
      const first = active.samples[0]
      const directionalVelocity =
        ((event.clientX - first.x) / Math.max(1, event.timeStamp - first.time)) *
        (active.open ? -1 : 1)
      const distance = active.open ? 1 - active.progress : active.progress
      const travelled = Math.abs(event.clientX - active.startX)
      const commit =
        distance >= COMMIT_PROGRESS ||
        (travelled >= 24 && directionalVelocity >= FLING_VELOCITY)
      finish(commit ? !active.open : active.open)
    }

    const onCancel = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) {
        finish(drag.open)
      }
    }

    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) {
        return
      }
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('click', onClick, true)
      cancelAnimationFrame(frame)
      if (drag?.claimed) {
        setSiderDragging(false)
      }
      clearTransforms()
    }
  }, [isMobile, drawerRef, mainRef, sliverRef])
}
