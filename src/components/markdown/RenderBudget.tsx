import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { scheduleFrame, scheduleIdle } from '../../app/idleWork.js'

/** Only the newest turn is allowed to bypass the frame budget. */
const ActiveTurnContext = createContext(false)
export const MathBudgetContext = createContext(true)
export const ActiveTurnProvider = ActiveTurnContext.Provider
export const useActiveTurn = () => useContext(ActiveTurnContext)

/** Defer expensive Markdown extras by one frame per message. */
export const useRenderBudget = () => {
  const active = useActiveTurn()
  const [ready, setReady] = useState(active)
  useEffect(() => {
    if (ready) {return}
    return scheduleFrame(() => setReady(true))
  }, [ready])
  return ready
}

export const DeferredContent = ({ children }: { children: ReactNode }) => {
  const ready = useRenderBudget()
  const fallback = useMemo(() => <span />, [])
  return ready ? <>{children}</> : fallback
}

/** Lazy import point shared by all formula and highlight components. */
export const Deferred = ({ load, children, loading = false }: {
  load: () => Promise<unknown>
  children: (ready: boolean) => ReactNode
  loading?: boolean
}) => {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) {return}
    let active = true
    const begin = () => {
      let cancel: () => void
      if (loading) {
        cancel = scheduleIdle(() => void load().then(() => { if (active) {setReady(true)} }, () => {}))
      } else {
        void load().then(() => { if (active) {setReady(true)} }, () => {})
        cancel = () => {}
      }
      return cancel
    }
    const cancel = begin()
    return () => { active = false; cancel() }
  }, [load, loading, ready])
  return <>{children(ready)}</>
}
