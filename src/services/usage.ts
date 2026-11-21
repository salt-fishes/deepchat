import { openDB, type DBSchema } from 'idb'

type Totals = { requests: number; input: number; output: number; missingInput: number; missingOutput: number }
type UsageDatabase = DBSchema & { days: { key: string; value: Totals } }
const empty = (): Totals => ({ requests: 0, input: 0, output: 0, missingInput: 0, missingOutput: 0 })
let database: ReturnType<typeof openDB<UsageDatabase>> | undefined
const getDb = () => (database ??= openDB<UsageDatabase>('deepchat-usage', 1, {
  upgrade(db) { db.createObjectStore('days') },
}).catch((error: unknown) => {
  database = undefined
  throw error
}))

const dayKey = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

export const recordChatUsage = async (started: Date, input?: number, output?: number) => {
  const db = await getDb()
  const tx = db.transaction('days', 'readwrite')
  const day = dayKey(started)
  const current = await tx.store.get(day) ?? empty()
  await tx.store.put({
    requests: current.requests + 1,
    input: current.input + (input ?? 0),
    output: current.output + (output ?? 0),
    missingInput: current.missingInput + Number(input === undefined),
    missingOutput: current.missingOutput + Number(output === undefined),
  }, day)
  await tx.done
}

export const readChatUsage = async (days: 1 | 7 | 30, now = new Date()): Promise<Totals> => {
  const db = await getDb()
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
  const rows = await db.getAll('days', IDBKeyRange.bound(dayKey(first), dayKey(now)))
  return rows.reduce((total, row) => ({
    requests: total.requests + row.requests,
    input: total.input + row.input,
    output: total.output + row.output,
    missingInput: total.missingInput + row.missingInput,
    missingOutput: total.missingOutput + row.missingOutput,
  }), empty())
}
