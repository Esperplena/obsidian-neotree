import {
    FILE_STATS_LIMIT,
    SMART_MAGNET_HALF_LIFE_MS,
    SMART_MAGNET_LIMIT,
    SMART_MAGNET_MAX_AGE_MS,
    SMART_MAGNET_MIN_COUNT,
    TODAY_TRAIL_LIMIT
} from '../constants'
import type { ActivityData, ActivityFileStat } from '../types/plugin-settings.intf'

export function normalizeActivity(value: unknown): ActivityData {
    const activity = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const todayPaths = Array.isArray(activity['todayPaths'])
        ? (activity['todayPaths'] as unknown[]).filter(
              (path): path is string => typeof path === 'string'
          )
        : []
    const fileStats =
        activity['fileStats'] && typeof activity['fileStats'] === 'object'
            ? (activity['fileStats'] as Record<string, ActivityFileStat>)
            : {}
    const pinnedPaths: string[] = []
    const seenPinnedPaths = new Set<string>()
    for (const path of Array.isArray(activity['pinnedPaths'])
        ? (activity['pinnedPaths'] as unknown[])
        : []) {
        if (typeof path !== 'string' || !path || seenPinnedPaths.has(path)) continue
        seenPinnedPaths.add(path)
        pinnedPaths.push(path)
        if (pinnedPaths.length >= SMART_MAGNET_LIMIT) break
    }

    return {
        todayKey: typeof activity['todayKey'] === 'string' ? activity['todayKey'] : '',
        todayPaths: todayPaths.slice(-TODAY_TRAIL_LIMIT),
        pinnedPaths,
        fileStats: pruneFileStats(fileStats)
    }
}

export function smartMagnetScore(stat: unknown, now = Date.now()): number {
    const count = Number(stat && (stat as ActivityFileStat).count) || 0
    const lastOpened = Number(stat && (stat as ActivityFileStat).lastOpened) || 0
    if (count < SMART_MAGNET_MIN_COUNT || lastOpened <= 0) return Number.NEGATIVE_INFINITY

    const age = Math.max(0, now - lastOpened)
    if (age > SMART_MAGNET_MAX_AGE_MS) return Number.NEGATIVE_INFINITY

    const recency = 2 ** (-age / SMART_MAGNET_HALF_LIFE_MS)
    const frequency = Math.min(1, Math.log2(count + 1) / 6)
    return recency * 0.72 + frequency * 0.28
}

export interface MagnetRanking {
    pinnedPaths: string[]
    recommendedPaths: string[]
}

export function rankSmartMagnetPaths(value: unknown, now = Date.now()): MagnetRanking {
    const activity = normalizeActivity(value)
    const pinnedPaths = activity.pinnedPaths.slice(0, SMART_MAGNET_LIMIT)
    const pinnedSet = new Set(pinnedPaths)
    const remaining = Math.max(0, SMART_MAGNET_LIMIT - pinnedPaths.length)
    const recommendedPaths = Object.entries(activity.fileStats)
        .filter(([path]) => !pinnedSet.has(path))
        .map(([path, stat]) => ({ path, stat, score: smartMagnetScore(stat, now) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => {
            const scoreDiff = b.score - a.score
            if (scoreDiff) return scoreDiff
            const recentDiff = (Number(b.stat.lastOpened) || 0) - (Number(a.stat.lastOpened) || 0)
            if (recentDiff) return recentDiff
            const countDiff = (Number(b.stat.count) || 0) - (Number(a.stat.count) || 0)
            if (countDiff) return countDiff
            return a.path.localeCompare(b.path)
        })
        .slice(0, remaining)
        .map((entry) => entry.path)

    return { pinnedPaths, recommendedPaths }
}

export function pruneFileStats(fileStats: unknown): Record<string, ActivityFileStat> {
    return Object.fromEntries(
        Object.entries(
            fileStats && typeof fileStats === 'object' ? (fileStats as Record<string, unknown>) : {}
        )
            .filter(
                ([path, stat]) =>
                    typeof path === 'string' && stat !== null && typeof stat === 'object'
            )
            .sort(([, a], [, b]) => {
                const lastDiff =
                    (Number((b as ActivityFileStat).lastOpened) || 0) -
                    (Number((a as ActivityFileStat).lastOpened) || 0)
                if (lastDiff) return lastDiff
                return (
                    (Number((b as ActivityFileStat).count) || 0) -
                    (Number((a as ActivityFileStat).count) || 0)
                )
            })
            .slice(0, FILE_STATS_LIMIT)
    ) as Record<string, ActivityFileStat>
}

export function rewriteActivityPaths(
    value: unknown,
    oldPath: unknown,
    newPath: unknown
): ActivityData {
    const activity = normalizeActivity(value)
    const sourcePath = typeof oldPath === 'string' ? oldPath.replace(/\/+$/, '') : ''
    const destinationPath = typeof newPath === 'string' ? newPath.replace(/\/+$/, '') : null
    if (!sourcePath || destinationPath === sourcePath) {
        return activity
    }

    const rewritePath = (path: string): string | null => {
        if (path !== sourcePath && !path.startsWith(`${sourcePath}/`)) {
            return path
        }
        if (destinationPath === null) {
            return null
        }
        return `${destinationPath}${path.slice(sourcePath.length)}`
    }

    const rewrittenTodayPaths = activity.todayPaths
        .map(rewritePath)
        .filter((path): path is string => typeof path === 'string')
    const seenTodayPaths = new Set<string>()
    const todayPaths: string[] = []
    for (let index = rewrittenTodayPaths.length - 1; index >= 0; index -= 1) {
        const path = rewrittenTodayPaths[index]!
        if (seenTodayPaths.has(path)) continue
        seenTodayPaths.add(path)
        todayPaths.unshift(path)
    }

    const pinnedPaths: string[] = []
    const seenPinnedPaths = new Set<string>()
    for (const path of activity.pinnedPaths.map(rewritePath)) {
        if (!path || seenPinnedPaths.has(path)) continue
        seenPinnedPaths.add(path)
        pinnedPaths.push(path)
    }

    const fileStats: Record<string, ActivityFileStat> = {}
    for (const [path, stat] of Object.entries(activity.fileStats)) {
        const rewrittenPath = rewritePath(path)
        if (!rewrittenPath) continue
        const previous = fileStats[rewrittenPath]
        fileStats[rewrittenPath] = previous
            ? {
                  count: (Number(previous.count) || 0) + (Number(stat.count) || 0),
                  lastOpened: Math.max(
                      Number(previous.lastOpened) || 0,
                      Number(stat.lastOpened) || 0
                  )
              }
            : { ...stat }
    }

    return normalizeActivity({
        todayKey: activity.todayKey,
        todayPaths,
        pinnedPaths,
        fileStats
    })
}
