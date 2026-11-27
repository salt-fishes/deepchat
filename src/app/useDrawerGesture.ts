import { useEffect, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { getDrawerMotion, resolveDrawerTarget } from '../app/drawerMotion.js'
import {
  setSiderDragging,
  setSiderSettling,
  useMobileSider,
} from '../components/sider/mobileSiderState.js'

type DrawerGestureOptions = {
  isMobile: boolean
  drawerRef: RefObject<HTMLDivElement | null>
  mainRef: RefObject<HTMLElement | null>
  sliverRef: RefObject<HTMLDivElement | null>
}

const INTENT_DISTANCE = 10
const EDITOR = 'textarea, input, select, [contenteditable]:not([contenteditable="false"])'
const ENTER_EASING = 'cubic-bezier(0.2, 0.75, 0.25, 1)'
const EXIT_EASING = 'cubic-bezier(0.4, 0, 0.8, 0.55)'
const clamp = (value: number) => Math.max(0, Math.min(1, value))

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
      startedOpen: boolean
      width: number
      startX: number
      startY: number
      initialProgress: number
      claimed: boolean
      interrupted: boolean
      progress: number
      samples: { x: number; time: number }[]
    }
    type Settle = {
      generation: number
      timeout: number
      onEnd: (event: TransitionEvent) => void
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let drag: Drag | null = null
    let settle: Settle | null = null
    let suppressClick = false
    let frame = 0
    let settleFrame = 0
    let generation = 0

    const paint = (progress: number, width: number) => {
      const scale = reducedMotion.matches ? 1 : 1 - progress * 0.015
      drawer.style.transform = `translateX(${(progress - 1) * 100}%)`
      main.style.transform = `translateX(${progress * width}px) scaleY(${scale})`
    }

    const readProgress = () => {
      const transform = getComputedStyle(main).transform
      const x = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
      return clamp(x / Math.max(1, drawer.offsetWidth))
    }

    const clearInlineTransforms = () => {
      drawer.style.removeProperty('transform')
      main.style.removeProperty('transform')
      drawer.style.removeProperty('transition')
      main.style.removeProperty('transition')
    }

    const clearMotionVariables = () => {
      drawer.style.removeProperty('--drawer-duration')
      drawer.style.removeProperty('--drawer-easing')
      main.style.removeProperty('--drawer-duration')
      main.style.removeProperty('--drawer-easing')
    }

    const clearSettle = () => {
      if (!settle) {
        return
      }
      window.clearTimeout(settle.timeout)
      main.removeEventListener('transitionend', settle.onEnd)
      settle = null
      if (settleFrame) {
        cancelAnimationFrame(settleFrame)
        settleFrame = 0
      }
    }

    const finishSettle = (expected: number) => {
      if (!settle || settle.generation !== expected) {
        return
      }
      clearSettle()
      clearInlineTransforms()
      clearMotionVariables()
      setSiderSettling(false)
    }

    const beginSettle = (targetOpen: boolean, progress: number, velocity = 0) => {
      clearSettle()
      drawer.style.removeProperty('transition')
      main.style.removeProperty('transition')
      const width = Math.max(1, drawer.offsetWidth)
      const current = clamp(progress)
      const target = targetOpen ? 1 : 0
      if (Math.abs(target - current) < 0.005 || reducedMotion.matches) {
        useMobileSider.setState({ open: targetOpen, dragging: false, settling: false })
        clearInlineTransforms()
        clearMotionVariables()
        return
      }
      const currentGeneration = ++generation
      const motion = getDrawerMotion(current, targetOpen, velocity, width)
      const easing = motion.easing === 'enter' ? ENTER_EASING : EXIT_EASING
      useMobileSider.setState({ open: targetOpen, dragging: false, settling: true })
      paint(current, width)
      drawer.style.setProperty('--drawer-duration', `${motion.duration}ms`)
      drawer.style.setProperty('--drawer-easing', easing)
      main.style.setProperty('--drawer-duration', `${motion.duration}ms`)
      main.style.setProperty('--drawer-easing', easing)
      // Commit the release position before letting the CSS transition take over.
      void main.offsetWidth
      const onEnd = (event: TransitionEvent) => {
        if (event.target === main && event.propertyName === 'transform') {
          finishSettle(currentGeneration)
        }
      }
      settle = {
        generation: currentGeneration,
        timeout: window.setTimeout(() => finishSettle(currentGeneration), motion.duration + 120),
        onEnd,
      }
      main.addEventListener('transitionend', onEnd)
      settleFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          if (settle?.generation === currentGeneration) {
            clearInlineTransforms()
          }
        })
      })
    }

    const releaseCapture = (active: Drag) => {
      if (active.surface.hasPointerCapture(active.id)) {
        active.surface.releasePointerCapture(active.id)
      }
    }

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary) {
        if (drag) {
          const active = drag
          drag = null
          if (active.claimed) {
            suppressClick = true
            releaseCapture(active)
            beginSettle(
              resolveDrawerTarget(active.progress, active.startedOpen, 0, 0),
              active.progress
            )
          } else if (active.interrupted) {
            beginSettle(useMobileSider.getState().open, active.progress)
          }
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
      const wasSettling = !!settle
      const state = useMobileSider.getState()
      const surface = [main, ...(state.open || wasSettling ? [drawer, sliver] : [])].find((item) =>
        item.contains(target)
      )
      if (!surface || !drawer.offsetWidth) {
        return
      }
      const initialProgress = readProgress()
      if (wasSettling) {
        clearSettle()
        drawer.style.transition = 'none'
        main.style.transition = 'none'
        paint(initialProgress, drawer.offsetWidth)
      }
      drag = {
        id: event.pointerId,
        surface,
        target,
        startedOpen: initialProgress >= 0.5,
        width: drawer.offsetWidth,
        startX: event.clientX,
        startY: event.clientY,
        initialProgress,
        claimed: false,
        interrupted: wasSettling,
        progress: initialProgress,
        samples: [{ x: event.clientX, time: event.timeStamp }],
      }
    }

    const track = (active: Drag, event: PointerEvent) => {
      active.samples.push({ x: event.clientX, time: event.timeStamp })
      active.samples = active.samples.filter(({ time }) => event.timeStamp - time <= 100)
      active.progress = clamp(
        active.initialProgress + (event.clientX - active.startX) / active.width
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
        const selecting = window.getSelection()?.type === 'Range'
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
        const outward =
          (active.initialProgress <= 0.001 && dx < 0) || (active.initialProgress >= 0.999 && dx > 0)
        if (outward || Math.abs(dx) < Math.abs(dy) * 1.2 || selecting || horizontalScroll) {
          const interrupted = active.interrupted
          drag = null
          if (interrupted) {
            beginSettle(useMobileSider.getState().open, active.progress)
          }
          return
        }
        active.claimed = true
        try {
          active.surface.setPointerCapture(event.pointerId)
        } catch {
          const interrupted = active.interrupted
          drag = null
          if (interrupted) {
            beginSettle(useMobileSider.getState().open, active.progress)
          }
          return
        }
        paint(active.initialProgress, drawer.offsetWidth)
        flushSync(() => setSiderDragging(true))
      }
      track(active, event)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          if (drag === active) {
            paint(active.progress, drawer.offsetWidth)
          }
        })
      }
    }

    const onUp = (event: PointerEvent) => {
      const active = drag
      if (!active || event.pointerId !== active.id) {
        return
      }
      drag = null
      if (!active.claimed) {
        if (active.interrupted) {
          beginSettle(useMobileSider.getState().open, active.progress)
        }
        return
      }
      track(active, event)
      const first = active.samples[0]
      const last = active.samples.at(-1) ?? first
      const elapsed = Math.max(1, last.time - first.time)
      const velocity = (last.x - first.x) / elapsed
      const recentTravel = Math.abs(last.x - first.x)
      const targetOpen = resolveDrawerTarget(
        active.progress,
        active.startedOpen,
        velocity,
        recentTravel
      )
      suppressClick = true
      releaseCapture(active)
      beginSettle(targetOpen, active.progress, velocity)
    }

    const onCancel = (event: PointerEvent) => {
      const active = drag
      if (!active || event.pointerId !== active.id) {
        return
      }
      drag = null
      if (!active.claimed) {
        if (active.interrupted) {
          beginSettle(useMobileSider.getState().open, active.progress)
        }
        return
      }
      suppressClick = true
      releaseCapture(active)
      beginSettle(resolveDrawerTarget(active.progress, active.startedOpen, 0, 0), active.progress)
    }

    const onLostCapture = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) {
        return
      }
      onCancel(event)
    }

    const onClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) {
        return
      }
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }

    const unsubscribe = useMobileSider.subscribe((state, previous) => {
      if (state.gestureEpoch === previous.gestureEpoch) {
        return
      }
      generation++
      cancelAnimationFrame(frame)
      frame = 0
      if (drag?.claimed || settle) {
        const progress = readProgress()
        drag = null
        beginSettle(state.open, progress)
      } else {
        drag = null
        clearInlineTransforms()
        clearMotionVariables()
      }
    })
    const onReducedMotionChange = () => {
      if (reducedMotion.matches && settle) {
        finishSettle(settle.generation)
      }
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('lostpointercapture', onLostCapture, true)
    window.addEventListener('click', onClick, true)
    reducedMotion.addEventListener('change', onReducedMotionChange)
    return () => {
      unsubscribe()
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('lostpointercapture', onLostCapture, true)
      window.removeEventListener('click', onClick, true)
      reducedMotion.removeEventListener('change', onReducedMotionChange)
      cancelAnimationFrame(frame)
      clearSettle()
      if (drag?.claimed) {
        setSiderDragging(false)
      }
      if (useMobileSider.getState().settling) {
        setSiderSettling(false)
      }
      clearInlineTransforms()
      clearMotionVariables()
    }
  }, [isMobile, drawerRef, mainRef, sliverRef])
}
