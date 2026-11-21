import { create } from 'zustand'

const key = 'deepchat:pinned-sessions'
const load = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const useSessionPins = create(() => ({ ids: load() }))

export const setSessionPins = (ids: Iterable<string>, pinned: boolean) => {
  const next = new Set(useSessionPins.getState().ids)
  for (const id of ids) {
    if (pinned) {
      next.add(id)
    } else {
      next.delete(id)
    }
  }
  const values = [...next]
  try {
    localStorage.setItem(key, JSON.stringify(values))
  } catch {
    // The current session can still use pins when storage is unavailable.
  }
  useSessionPins.setState({ ids: values })
}
