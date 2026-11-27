import { create } from 'zustand'

export type MessageEditTarget = {
  sessionId: string
  userId: string
  generation: number
}

let nextGeneration = 0

export const useMessageEdit = create<{
  target: MessageEditTarget | null
  begin: (target: Omit<MessageEditTarget, 'generation'>) => void
  clear: () => void
}>(() => ({
  target: null,
  begin: (target) =>
    useMessageEdit.setState({ target: { ...target, generation: ++nextGeneration } }),
  clear: () => useMessageEdit.setState({ target: null }),
}))
