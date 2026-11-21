import { translate } from '../../i18n/index.js'
import type { SessionSummary } from './types.js'

const DAY = 86_400_000

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/** 分组：今天 / 昨天 / 7 天内 / 30 天内 / 更早 */
export const groupSessions = (sessions: SessionSummary[], now: number, t = translate) => {
  const groups: { key: string; label: string; sessions: SessionSummary[] }[] = []
  for (const session of sessions) {
    const diff = Math.floor((now - startOfDay(session.updatedAt)) / DAY)
    const key =
      diff <= 0
        ? 'sessionHistoryTimelineLabelToday'
        : diff <= 1
          ? 'sessionHistoryTimelineLabelYesterday'
          : diff < 7
            ? 'sessionHistoryTimelineLabel7days'
            : diff < 30
              ? 'sessionHistoryTimelineLabel30days'
              : 'sessionHistoryTimelineLabelOlder'
    const last = groups.at(-1)
    if (last?.key === key) {
      last.sessions.push(session)
    } else {
      groups.push({ key, label: t(key), sessions: [session] })
    }
  }
  return groups
}
