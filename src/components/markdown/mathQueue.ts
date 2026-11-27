type Slot = {
  id: number
  cancelled: boolean
  run: () => Promise<void>
  started: boolean
}

let queue: Slot[] = []
let active = 0
let nextId = 0
const MAX_ACTIVE = 1

export const scheduleMath =(work: () => Promise<void>): (() => void) => {
  const slot: Slot = { id: ++nextId, cancelled: false, run: work, started: false }
  queue.push(slot)
  const start = () => {
    if (active >= MAX_ACTIVE || slot.started) {return}
    const index = queue.indexOf(slot)
    if (index < 0) {return}
    queue.splice(index, 1)
    active += 1
    slot.started = true
    void slot.run().finally(() => {
      active -= 1
      start()
    })
  }
  const timer = window.setTimeout(start, 16)
  start()
  return () => {
    slot.cancelled = true
    window.clearTimeout(timer)
    const index = queue.indexOf(slot)
    if (index >= 0) {queue.splice(index, 1)}
  }
}
