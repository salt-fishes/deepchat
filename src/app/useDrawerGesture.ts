import { useEffect, type RefObject } from 'react'
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
  /** 左缘打开热区（含系统手势排除区，保留更强的捕获式处理） */
  edgeRef: RefObject<HTMLDivElement | null>
  /** 抽屉打开后盖在主内容 sliver 上的点击/拖拽层 */
  sliverRef: RefObject<HTMLDivElement | null>
}

/** 拖动速度阈值（px/ms）：超过直接按速度方向提交 */
const FLING_VELOCITY = 0.2
/** 触发横向意图的位移阈值（px） */
const INTENT_THRESHOLD = 8
/** 提交开/关的进度门槛（放宽：不到一半也提交，跟手更省力） */
const COMMIT_PROGRESS = 0.3
/** 文本输入类元素上不启动页面手势，避免与文本选择冲突 */
const INPUT_SELECTOR = 'textarea, input:not([type="file"]), [contenteditable="true"]'

/**
 * 推挤式抽屉手势（对齐官方：页面内部任意位置可滑，不只是边缘）：
 * - 关闭态：左缘热区（捕获式）或主内容任意位置右滑拖出，跟手进度直写 DOM（不触发 React 渲染）；
 * - 打开态：抽屉、sliver 或主内容上左滑拖回；纵向滑动不劫持（意图判定 + pointercancel 让位原生滚动）；
 * - 松手按进度与速度提交，门槛放宽（30% 或明显甩动即提交），过渡由 CSS transition 完成。
 */
export const useDrawerGesture = ({
  isMobile,
  drawerRef,
  mainRef,
  edgeRef,
  sliverRef,
}: DrawerGestureOptions) => {
  useEffect(() => {
    if (!isMobile) {
      return
    }
    const drawer = drawerRef.current
    const main = mainRef.current
    const edge = edgeRef.current
    const sliver = sliverRef.current
    if (!drawer || !main || !edge || !sliver) {
      return
    }

    const pushWidth = () => drawer.getBoundingClientRect().width || window.innerWidth * 0.83

    type Drag = {
      pointerId: number
      startX: number
      startY: number
      progress: number
      mode: 'open' | 'undecided' | 'close'
      /** 主内容上启动时抽屉的开合（决定未定向拖动的方向语义） */
      openAtStart: boolean
      lastX: number
      lastTime: number
      velocity: number
      moved: boolean
      /** 边缘热区使用捕获+preventDefault；主内容上不能这么做（要让位原生滚动） */
      captured: boolean
    }
    let drag: Drag | null = null
    /** 最近一次确认发生拖动的时间，用于抑制拖动结束后的误触发点击 */
    let movedAt = 0

    const applyProgress = (progress: number) => {
      const clamped = Math.min(1, Math.max(0, progress))
      drawer.style.transform = `translateX(${(clamped - 1) * 100}%)`
      main.style.transform = `translateX(${clamped * pushWidth()}px)`
    }

    /** 提交到目标状态：恢复过渡后把 inline transform 平滑归位，动画结束清掉 inline 让类接管 */
    const commit = (targetOpen: boolean) => {
      const ended = drag
      drag = null
      setSiderDragging(false)
      applyProgress(targetOpen ? 1 : 0)
      if (targetOpen) {
        openMobileSider()
      } else {
        closeMobileSider()
      }
      window.setTimeout(() => {
        drawer.style.transform = ''
        main.style.transform = ''
        void ended
      }, 320)
    }

    /** 原生滚动等接管（pointercancel）：不提交，直接按当前开合状态归位 */
    const abort = () => {
      drag = null
      setSiderDragging(false)
      applyProgress(useMobileSider.getState().open ? 1 : 0)
      window.setTimeout(() => {
        drawer.style.transform = ''
        main.style.transform = ''
      }, 320)
    }

    const trackVelocity = (event: PointerEvent) => {
      if (!drag) {
        return
      }
      const dt = event.timeStamp - drag.lastTime
      if (dt > 0) {
        drag.velocity = (event.clientX - drag.lastX) / dt
        drag.lastX = event.clientX
        drag.lastTime = event.timeStamp
      }
    }

    /** 打开手势起点：从左缘热区拖出（热区 touch-action:none，可放心捕获） */
    const onEdgeDown = (event: PointerEvent) => {
      if (drag) {
        return
      }
      // 阻止文本选择等默认行为；触摸滚动由 touch-action: none 兜底
      event.preventDefault()
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        progress: 0,
        mode: 'open',
        openAtStart: false,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        moved: false,
        captured: true,
      }
      try {
        edge.setPointerCapture(event.pointerId)
      } catch {
        // 无活跃指针（合成事件等）时忽略
      }
      setSiderDragging(true)
    }

    /** 拖动起点（抽屉内容 / sliver / 主内容）：先做横向意图判定 */
    const onDragDown = (event: PointerEvent, allowOpen: boolean) => {
      if (drag) {
        return
      }
      const openAtStart = useMobileSider.getState().open
      // 关闭态在主内容上只认右滑（打开），打开态只认左滑（关闭）
      if (!allowOpen && !openAtStart) {
        return
      }
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        progress: openAtStart ? 1 : 0,
        mode: 'undecided',
        openAtStart,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        moved: false,
        captured: false,
      }
      const target = event.currentTarget as HTMLElement
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // 无活跃指针（合成事件等）时忽略
      }
    }

    /** 主内容上的拖动起点：关闭态右滑、打开态左滑均可，且不能 preventDefault（让位纵向滚动） */
    const onMainDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(INPUT_SELECTOR)) {
        return
      }
      onDragDown(event, true)
    }

    const onDrawerDown = (event: PointerEvent) => {
      onDragDown(event, false)
    }

    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      trackVelocity(event)
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > INTENT_THRESHOLD) {
        drag.moved = true
        movedAt = Date.now()
      }
      if (drag.mode === 'undecided') {
        if (Math.abs(dx) > INTENT_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          // 确认横向意图：按拖动起点时的开合状态锁定方向，此后由手势接管视觉（无过渡）
          if (drag.openAtStart) {
            drag.mode = 'close'
          } else if (dx > 0) {
            drag.mode = 'open'
          } else {
            // 关闭态上的左滑与抽屉无关，交还给页面
            drag = null
            return
          }
          setSiderDragging(true)
        } else if (Math.abs(dy) > INTENT_THRESHOLD) {
          // 纵向意图：放弃拖动，交还给列表滚动
          const target = event.currentTarget as HTMLElement
          if (drag.captured) {
            try {
              target.releasePointerCapture(event.pointerId)
            } catch {
              // capture 可能已释放
            }
          }
          drag = null
          return
        } else {
          return
        }
      }
      if (drag.mode === 'open') {
        drag.progress = Math.min(1, Math.max(0, dx / pushWidth()))
      } else if (drag.mode === 'close') {
        drag.progress = Math.min(1, Math.max(0, 1 + dx / pushWidth()))
      }
      applyProgress(drag.progress)
    }

    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      trackVelocity(event)
      const { progress, velocity, mode } = drag
      if (mode === 'undecided') {
        // 未达到意图阈值：视为点击，不做抽屉操作
        drag = null
        return
      }
      if (mode === 'open') {
        commit(progress > COMMIT_PROGRESS || velocity > FLING_VELOCITY)
      } else {
        // 关闭拖动：拖入不足 70% 或明显向左甩 → 关闭，否则回弹到打开
        commit(!(progress < 1 - COMMIT_PROGRESS || velocity < -FLING_VELOCITY))
      }
    }

    const onCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      if (drag.captured) {
        // 捕获式（边缘热区）取消按松手处理
        onUp(event)
        return
      }
      // 页面内手势被原生滚动接管：不提交，按当前状态归位
      abort()
    }

    // 拖动后抑制误触发的点击（按钮/会话项）；commit 时 drag 已清空，靠 movedAt 时间窗判断
    const onClickCapture = (event: MouseEvent) => {
      if (Date.now() - movedAt < 400) {
        event.stopPropagation()
        event.preventDefault()
      }
    }

    edge.addEventListener('pointerdown', onEdgeDown)
    sliver.addEventListener('pointerdown', onDrawerDown)
    drawer.addEventListener('pointerdown', onDrawerDown)
    main.addEventListener('pointerdown', onMainDown)
    for (const element of [edge, drawer, sliver, main]) {
      element.addEventListener('pointermove', onMove)
      element.addEventListener('pointerup', onUp)
      element.addEventListener('pointercancel', onCancel)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => {
      edge.removeEventListener('pointerdown', onEdgeDown)
      sliver.removeEventListener('pointerdown', onDrawerDown)
      drawer.removeEventListener('pointerdown', onDrawerDown)
      main.removeEventListener('pointerdown', onMainDown)
      for (const element of [edge, drawer, sliver, main]) {
        element.removeEventListener('pointermove', onMove)
        element.removeEventListener('pointerup', onUp)
        element.removeEventListener('pointercancel', onCancel)
      }
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [isMobile, drawerRef, mainRef, edgeRef, sliverRef])
}
