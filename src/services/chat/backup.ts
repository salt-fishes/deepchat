import { formatDate } from '../../utils/format.js'
import * as db from './db.js'
import { replaceHistory, useChatStore } from './store.js'
import type { ArchiveSource } from './history/zipReader.js'
import type { Session } from './types.js'
import { getNativeImportStatus, savesHistoryNatively } from './history/saveBackup.js'
import { BackupError } from './history/errors.js'

export { BackupError } from './history/errors.js'

export type HistoryProgress =
  | { phase: 'opening' | 'checking' | 'preparing' | 'replacing' | 'choosing' }
  | { phase: 'reading' | 'images' | 'saving'; percent: number }
  | { phase: 'sessions'; completed: number; total: number }

type ReportProgress = (progress: HistoryProgress) => void

const reportPercent = (phase: 'reading' | 'images', report?: ReportProgress) => {
  let previous = -1
  return (completed: number, total: number) => {
    const percent = Math.floor((completed / total) * 100)
    if (percent !== previous) {
      previous = percent
      report?.({ phase, percent })
    }
  }
}

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepchat_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (report?: ReportProgress): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        const session = Object.hasOwn(sessionCache, summary.id)
          ? sessionCache[summary.id]
          : await db.loadSession(summary.id)
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const total = sessions.length
    const onSession = (completed: number) => report?.({ phase: 'sessions', completed, total })
    onSession(0)
    const blob = await exportArchive(readSessions(), onSession, reportPercent('images', report))
    return { name: backupFileName(now), blob }
  })

/**
 * 确认覆盖后调用：先检查 ZIP 格式与版本，校验失败时保留正在生成的回答；
 * 通过后从 ZIP 流式写入暂存，成功才替换原有会话与图片原件。返回导入的会话数。
 */
export const importHistory = (file: ArchiveSource, report?: ReportProgress): Promise<number> =>
  enqueueBackup(async () => {
    const start = file.startNativeImport
    if (start) {
      return replaceHistory(async () => {
        const { id } = await start()
        await waitForNativeImport(id, report)
      }, true)
    }
    const { checkArchiveFormat, importArchive } = await import('./history/importArchive.js')
    const archive = await checkArchiveFormat(file)
    report?.({ phase: 'preparing' })
    return replaceHistory(() => {
      report?.({ phase: 'reading', percent: 0 })
      return importArchive(archive, reportPercent('reading', report), () =>
        report?.({ phase: 'replacing' })
      )
    })
  })

const waitForNativeImport = async (id: string, report?: ReportProgress) => {
  for (;;) {
    const status = await getNativeImportStatus()
    if (status.state === 'idle' || status.id !== id) {
      throw new BackupError('historyImportFailed')
    }
    if (status.state === 'success') {
      return
    }
    if (status.state === 'failure') {
      throw new BackupError(status.key)
    }
    report?.(status.phase === 'reading' ? { phase: 'reading', percent: status.percent } : { phase: status.phase })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 750))
  }
}

let resumed: Promise<void> | undefined

/** Reattach after Android recreates the activity while the service is still running. */
export const resumeNativeImport = () => resumed ??= (async () => {
  if (!savesHistoryNatively()) {
    return
  }
  const status = await getNativeImportStatus()
  if (status.state === 'running') {
    await enqueueBackup(() => replaceHistory(() => waitForNativeImport(status.id), true))
  }
})()

/** 确认删除后调用：以空历史原子替换全部本地会话与附件，保留 API Key 和其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await replaceHistory(async () => {})
  })
