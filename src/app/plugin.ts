import { MarkdownView, Menu, Notice, Plugin, TFile, TFolder, View } from 'obsidian'
import type { TAbstractFile } from 'obsidian'
import {
    ACTIVE_REVEAL_RETRY_DELAYS,
    ACTIVITY_SAVE_DELAY_MS,
    FILE_STATS_LIMIT,
    INTERACTION_LOCK_MS,
    SMART_MAGNET_LIMIT,
    TODAY_TRAIL_LIMIT
} from './constants'
import { getLocalDateKey, normalizeOrbStyle, normalizeSoundStyle } from './domain/orb'
import {
    normalizeActivity,
    pruneFileStats,
    rankSmartMagnetPaths,
    rewriteActivityPaths
} from './services/activity'
import type { MagnetRanking } from './services/activity'
import { CrispAudio } from './services/audio'
import { FileExplorerRail } from './services/rail'
import { CrispFileExplorerSettingTab } from './settings/settings-tab'
import { registerCommands } from './commands'
import { DEFAULT_SETTINGS } from './types/plugin-settings.intf'
import type { PluginSettings } from './types/plugin-settings.intf'
import { getOwnerDocument, isConnectedToOwnerDocument } from './utils/dom'
import { log } from '../utils/log'

interface FileExplorerItemRecord {
    selfEl?: HTMLElement
    titleEl?: HTMLElement
    el?: HTMLElement
    collapsed?: boolean
    setCollapsed?(collapsed: boolean, recursive?: boolean): void
}

interface FileExplorerView extends View {
    fileItems?: Record<string, FileExplorerItemRecord>
}

export class NeotreePlugin extends Plugin {
    /** 只读共享空集，供功能关闭时的 getter 返回，避免每次分配。 */
    private static readonly EMPTY_STRING_SET = new Set<string>()

    settings: PluginSettings = DEFAULT_SETTINGS
    audio!: CrispAudio
    private unloading = false
    private controllers = new Map<HTMLElement, FileExplorerRail>()
    private refreshQueued = false
    private refreshFrame: number | null = null
    private pendingRefreshReveal = false
    private activeRevealFrame: number | null = null
    private activeRevealTimers: number[] = []
    private activeRevealRunId = 0
    private interactionLockUntil = 0
    private activitySaveTimer: number | null = null
    private saveQueue: Promise<void> = Promise.resolve()
    private todayPathSetCache: Set<string> | null = null
    private frequentPathSetCache: Set<string> | null = null
    private pinnedPathSetCache: Set<string> | null = null
    private magnetRankingCache: MagnetRanking | null = null
    private magnetRankingCacheKey = ''
    private runtimeStarted = false
    private observer: MutationObserver | null = null
    private enabledDocuments = new Set<Document>()

    override async onload(): Promise<void> {
        this.unloading = false
        this.audio = new CrispAudio()
        await this.loadSettings()
        this.addSettingTab(new CrispFileExplorerSettingTab(this.app, this))

        this.enableDocument(getOwnerDocument(this.app.workspace.containerEl))
        this.app.workspace.onLayoutReady(() => {
            if (!this.unloading) this.startRuntime()
        })

        registerCommands(this)
    }

    private startRuntime(): void {
        if (this.runtimeStarted || this.unloading) return
        this.runtimeStarted = true
        this.enhanceFileExplorers()

        this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRefresh()))
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.scheduleRefresh()
                if (this.isMarkdownActiveLeaf()) this.scheduleActiveReveal()
            })
        )
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                this.recordFileActivity(file)
                if (file && file.extension === 'md') {
                    this.scheduleActiveReveal()
                } else {
                    this.scheduleRefresh()
                }
            })
        )
        this.registerEvent(this.app.workspace.on('window-open', () => this.scheduleRefresh()))
        this.registerEvent(this.app.workspace.on('window-close', () => this.scheduleRefresh()))
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.rewriteActivityPath(oldPath, file.path)
            })
        )
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                this.rewriteActivityPath(file.path, null)
            })
        )
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                this.addCrispRailMenuItem(menu, file)
            })
        )
        this.registerDomEvent(window, 'resize', () => this.scheduleRefresh(), { passive: true })

        this.observer = new MutationObserver(() => this.scheduleRefresh())
        this.observer.observe(this.app.workspace.containerEl, {
            childList: true,
            subtree: false
        })
        this.register(() => {
            if (this.observer) this.observer.disconnect()
        })
    }

    override onunload(): void {
        this.unloading = true
        if (this.refreshFrame) window.cancelAnimationFrame(this.refreshFrame)
        this.refreshFrame = null
        this.refreshQueued = false
        this.pendingRefreshReveal = false
        this.activeRevealRunId += 1
        this.cancelActiveRevealFrame()
        this.clearActiveRevealTimers()
        const pendingSave = this.flushActivitySave()
        if (pendingSave) {
            pendingSave.catch((error) => log('final save failed', 'error', error))
        }
        this.audio.destroy().catch((error) => log('audio cleanup failed', 'error', error))
        for (const ownerDocument of this.enabledDocuments) {
            if (ownerDocument && ownerDocument.body) {
                ownerDocument.body.classList.remove('crisp-file-explorer-enabled')
            }
        }
        this.enabledDocuments.clear()
        for (const controller of this.controllers.values()) {
            controller.destroy()
        }
        this.controllers.clear()
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as PluginSettings
        this.settings.orbStyle = normalizeOrbStyle(this.settings.orbStyle)
        this.settings.soundStyle = normalizeSoundStyle(this.settings.soundStyle)
        this.settings.activity = normalizeActivity(this.settings.activity)
        this.ensureTodayActivity()
    }

    saveSettings(): Promise<void> {
        const snapshot = JSON.parse(JSON.stringify(this.settings)) as PluginSettings
        const previous = this.saveQueue
        const next = previous.catch(() => {}).then(() => this.saveData(snapshot))
        this.saveQueue = next
        return next
    }

    private ensureTodayActivity(): void {
        const todayKey = getLocalDateKey()
        if (!this.settings.activity || typeof this.settings.activity !== 'object') {
            this.settings.activity = normalizeActivity(this.settings.activity)
        }
        if (this.settings.activity.todayKey !== todayKey) {
            this.settings.activity.todayKey = todayKey
            this.settings.activity.todayPaths = []
            this.invalidateActivityCaches()
        }
    }

    private invalidateActivityCaches(): void {
        this.todayPathSetCache = null
        this.frequentPathSetCache = null
        this.pinnedPathSetCache = null
        this.magnetRankingCache = null
        this.magnetRankingCacheKey = ''
    }

    private addCrispRailMenuItem(menu: Menu, file: TAbstractFile): void {
        if (
            !menu ||
            typeof menu.addItem !== 'function' ||
            !file ||
            !file.path ||
            file instanceof TFolder
        )
            return
        const pinned = normalizeActivity(this.settings.activity).pinnedPaths.includes(file.path)
        menu.addItem((item) => {
            item.setTitle(pinned ? '从 Crisp Rail 取消固定' : '固定到 Crisp Rail')
                .setIcon(pinned ? 'pin-off' : 'pin')
                .onClick(async () => {
                    const result = await this.togglePinnedPath(file.path)
                    if (!result.changed) {
                        new Notice(`Crisp Rail 最多固定 ${SMART_MAGNET_LIMIT} 个文件`)
                        return
                    }
                    new Notice(result.pinned ? '已固定到 Crisp Rail' : '已从 Crisp Rail 取消固定')
                })
        })
    }

    async togglePinnedPath(
        path: string
    ): Promise<{ changed: boolean; pinned: boolean; limitReached?: boolean }> {
        if (!path) return { changed: false, pinned: false }
        const activity = normalizeActivity(this.settings.activity)
        const pinnedPaths = activity.pinnedPaths.slice()
        const index = pinnedPaths.indexOf(path)
        let pinned = false

        if (index >= 0) {
            pinnedPaths.splice(index, 1)
        } else {
            if (pinnedPaths.length >= SMART_MAGNET_LIMIT) {
                return { changed: false, pinned: false, limitReached: true }
            }
            pinnedPaths.push(path)
            pinned = true
        }

        this.settings.activity = normalizeActivity({ ...activity, pinnedPaths })
        this.invalidateActivityCaches()
        await this.saveSettings()
        this.scheduleRefresh()
        return { changed: true, pinned }
    }

    private rewriteActivityPath(oldPath: string, newPath: string | null): void {
        const previous = this.settings.activity
        const next = rewriteActivityPaths(previous, oldPath, newPath)
        if (JSON.stringify(next) === JSON.stringify(previous)) return
        this.settings.activity = next
        this.invalidateActivityCaches()
        this.scheduleActivitySave()
        this.scheduleRefresh()
    }

    private recordFileActivity(file: TFile | null): void {
        if (!file || !file.path) return

        this.ensureTodayActivity()
        const path = file.path
        const activity = this.settings.activity
        const isNewPath = !activity.fileStats[path]
        const stat = activity.fileStats[path] ?? { count: 0, lastOpened: 0 }
        activity.fileStats[path] = {
            count: (Number(stat.count) || 0) + 1,
            lastOpened: Date.now()
        }
        if (isNewPath && Object.keys(activity.fileStats).length > FILE_STATS_LIMIT) {
            activity.fileStats = pruneFileStats(activity.fileStats)
        }

        activity.todayPaths = activity.todayPaths.filter((current) => current !== path)
        activity.todayPaths.push(path)
        activity.todayPaths = activity.todayPaths.slice(-TODAY_TRAIL_LIMIT)
        this.invalidateActivityCaches()

        this.scheduleActivitySave()
        this.scheduleRefresh()
    }

    private scheduleActivitySave(): void {
        if (this.activitySaveTimer) window.clearTimeout(this.activitySaveTimer)
        this.activitySaveTimer = window.setTimeout(() => {
            void (async () => {
                this.activitySaveTimer = null
                try {
                    await this.saveSettings()
                } catch (error) {
                    log('activity save failed', 'error', error)
                }
            })()
        }, ACTIVITY_SAVE_DELAY_MS)
    }

    private flushActivitySave(): Promise<void> | null {
        if (!this.activitySaveTimer) return null
        window.clearTimeout(this.activitySaveTimer)
        this.activitySaveTimer = null
        return this.saveSettings()
    }

    getTodayPathSet(): Set<string> {
        if (!this.settings.todayTrailEnabled) return NeotreePlugin.EMPTY_STRING_SET
        this.ensureTodayActivity()
        if (!this.todayPathSetCache) {
            this.todayPathSetCache = new Set(this.settings.activity.todayPaths)
        }
        return this.todayPathSetCache
    }

    getFrequentPathSet(): Set<string> {
        if (!this.settings.frequentMagnetsEnabled) return NeotreePlugin.EMPTY_STRING_SET
        if (!this.frequentPathSetCache) {
            this.frequentPathSetCache = new Set(this.getFrequentPaths())
        }
        return this.frequentPathSetCache
    }

    getPinnedPathSet(): Set<string> {
        if (!this.settings.frequentMagnetsEnabled) return NeotreePlugin.EMPTY_STRING_SET
        if (!this.pinnedPathSetCache) {
            this.pinnedPathSetCache = new Set(this.getMagnetRanking().pinnedPaths)
        }
        return this.pinnedPathSetCache
    }

    getMagnetRanking(now = Date.now()): MagnetRanking {
        const cacheKey = getLocalDateKey(new Date(now))
        let ranking = this.magnetRankingCache
        if (!ranking || this.magnetRankingCacheKey !== cacheKey) {
            ranking = rankSmartMagnetPaths(this.settings.activity, now)
            this.magnetRankingCache = ranking
            this.magnetRankingCacheKey = cacheKey
        }
        return ranking
    }

    private getFrequentPaths(): string[] {
        if (!this.settings.frequentMagnetsEnabled) return []
        return this.getMagnetRanking().recommendedPaths
    }

    expandFolderInExplorers(folderPath: string): boolean {
        if (!folderPath) return false
        const leaves = this.app.workspace.getLeavesOfType('file-explorer')
        let didExpand = false

        for (const leaf of leaves) {
            const view = leaf.view as FileExplorerView
            const folderItem = view.fileItems?.[folderPath]
            if (!folderItem || typeof folderItem.setCollapsed !== 'function') continue

            const wasCollapsed = folderItem.collapsed !== false
            if (wasCollapsed) folderItem.setCollapsed(false, true)
            didExpand = didExpand || wasCollapsed
        }

        return didExpand
    }

    enableDocument(ownerDocument: Document | null): void {
        if (!ownerDocument || !ownerDocument.body || !ownerDocument.body.classList) return
        ownerDocument.body.classList.add('crisp-file-explorer-enabled')
        this.enabledDocuments.add(ownerDocument)
    }

    updateOrbStyles(): void {
        for (const controller of this.controllers.values()) {
            controller.updateOrbStyle()
            controller.requestFrame()
        }
    }

    lockInteraction(duration = INTERACTION_LOCK_MS): void {
        this.interactionLockUntil = performance.now() + duration
    }

    private isInteractionLocked(): boolean {
        return performance.now() < this.interactionLockUntil
    }

    private clearActiveRevealTimers(): void {
        for (const timer of this.activeRevealTimers) {
            window.clearTimeout(timer)
        }
        this.activeRevealTimers = []
    }

    private cancelActiveRevealFrame(): void {
        if (this.activeRevealFrame) window.cancelAnimationFrame(this.activeRevealFrame)
        this.activeRevealFrame = null
    }

    private runActiveRevealAttempt(runId: number): boolean {
        if (runId !== this.activeRevealRunId) return false
        const didReveal = this.revealActiveFileInExplorer()
        if (didReveal) {
            this.cancelActiveRevealFrame()
            this.clearActiveRevealTimers()
        }
        this.scheduleRefresh(didReveal ? { reveal: true } : {})
        return didReveal
    }

    private isActiveFileVisibleInExplorers(file: TFile | null): boolean {
        if (!file || !file.path || !this.app || !this.app.workspace) return false
        const leaves = this.app.workspace.getLeavesOfType('file-explorer')
        for (const leaf of leaves) {
            const view = leaf.view as FileExplorerView
            if (!view || !view.fileItems) continue
            const fileItem = view.fileItems[file.path]
            const itemEl = this.getFileItemElement(fileItem)
            if (itemEl && itemEl.isConnected) {
                const rect =
                    typeof itemEl.getBoundingClientRect === 'function'
                        ? itemEl.getBoundingClientRect()
                        : null
                const containerRect =
                    view.containerEl && typeof view.containerEl.getBoundingClientRect === 'function'
                        ? view.containerEl.getBoundingClientRect()
                        : null
                if (rect && rect.height > 0 && containerRect) {
                    if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) {
                        return true
                    }
                }
            }
        }
        return false
    }

    private scheduleActiveReveal(): void {
        if (this.unloading) return
        if (this.isInteractionLocked()) {
            this.activeRevealRunId += 1
            this.cancelActiveRevealFrame()
            this.clearActiveRevealTimers()
            this.scheduleRefresh()
            return
        }

        if (!this.isMarkdownActiveLeaf()) {
            this.activeRevealRunId += 1
            this.cancelActiveRevealFrame()
            this.clearActiveRevealTimers()
            this.scheduleRefresh()
            return
        }

        const activeFile = this.app.workspace.getActiveFile()
        if (activeFile && this.isActiveFileVisibleInExplorers(activeFile)) {
            this.activeRevealRunId += 1
            this.cancelActiveRevealFrame()
            this.clearActiveRevealTimers()
            this.scheduleRefresh()
            return
        }

        const runId = this.activeRevealRunId + 1
        this.activeRevealRunId = runId
        this.cancelActiveRevealFrame()
        this.clearActiveRevealTimers()

        this.activeRevealFrame = window.requestAnimationFrame(() => {
            this.activeRevealFrame = null
            if (runId !== this.activeRevealRunId) return
            this.runActiveRevealAttempt(runId)
        })

        for (const delay of ACTIVE_REVEAL_RETRY_DELAYS) {
            const timer = window.setTimeout(() => {
                this.activeRevealTimers = this.activeRevealTimers.filter(
                    (current) => current !== timer
                )
                this.runActiveRevealAttempt(runId)
            }, delay)
            this.activeRevealTimers.push(timer)
        }
    }

    private revealActiveFileInExplorer(): boolean {
        if (this.isInteractionLocked()) return false
        if (!this.isMarkdownActiveLeaf()) return false

        const activeFile = this.app.workspace.getActiveFile()
        if (!activeFile) return false
        if (this.isActiveFileVisibleInExplorers(activeFile)) return false

        const didReveal = this.revealFileExplorerItem(activeFile)
        if (didReveal) this.restoreMarkdownFocus()
        return didReveal
    }

    private isMarkdownActiveLeaf(): boolean {
        const leaf = this.app.workspace.activeLeaf
        const view = leaf?.view
        return Boolean(
            view && (typeof view.getViewType !== 'function' || view.getViewType() === 'markdown')
        )
    }

    private restoreMarkdownFocus(): void {
        window.requestAnimationFrame(() => {
            if (this.unloading) return
            const leaf = this.app.workspace.activeLeaf
            const view = leaf?.view
            if (
                !view ||
                (typeof view.getViewType === 'function' && view.getViewType() !== 'markdown')
            )
                return

            if (leaf && typeof this.app.workspace.setActiveLeaf === 'function') {
                this.app.workspace.setActiveLeaf(leaf, { focus: true })
            }

            if (view instanceof MarkdownView && view.editor) {
                view.editor.focus()
            } else if (view.containerEl && typeof view.containerEl.focus === 'function') {
                view.containerEl.focus()
            }
        })
    }

    private revealFileExplorerItem(file: TFile): boolean {
        const leaves = this.app.workspace.getLeavesOfType('file-explorer')
        let didReveal = false

        for (const leaf of leaves) {
            const view = leaf.view as FileExplorerView
            if (!view || !view.fileItems) continue

            const parts = file.path.split('/')
            let folderPath = ''
            for (let index = 0; index < parts.length - 1; index += 1) {
                folderPath = folderPath ? `${folderPath}/${parts[index]}` : parts[index]!
                const folderItem = view.fileItems[folderPath]
                if (
                    folderItem &&
                    folderItem.collapsed !== false &&
                    typeof folderItem.setCollapsed === 'function'
                ) {
                    folderItem.setCollapsed(false, true)
                }
            }

            const fileItem = view.fileItems[file.path]
            const itemEl = this.getFileItemElement(fileItem)
            if (!itemEl || itemEl.isConnected === false) continue
            const rect =
                typeof itemEl.getBoundingClientRect === 'function'
                    ? itemEl.getBoundingClientRect()
                    : null
            if (rect && rect.height === 0) continue
            didReveal = true
        }

        return didReveal
    }

    private getFileItemElement(
        fileItem: FileExplorerItemRecord | null | undefined
    ): HTMLElement | null {
        if (!fileItem) return null
        if (fileItem.selfEl) return fileItem.selfEl
        if (fileItem.titleEl) return fileItem.titleEl
        if (fileItem.el && typeof fileItem.el.querySelector === 'function') {
            return fileItem.el.querySelector('.tree-item-self') ?? fileItem.el
        }
        return fileItem.el ?? null
    }

    scheduleRefresh(options: { reveal?: boolean } = {}): void {
        if (this.unloading) return
        this.pendingRefreshReveal = this.pendingRefreshReveal || Boolean(options.reveal)
        if (this.refreshQueued) return
        this.refreshQueued = true
        this.refreshFrame = window.requestAnimationFrame(() => {
            this.refreshFrame = null
            this.refreshQueued = false
            if (this.unloading) {
                this.pendingRefreshReveal = false
                return
            }
            const reveal = this.pendingRefreshReveal
            this.pendingRefreshReveal = false
            const createdControllers = this.enhanceFileExplorers()
            for (const controller of this.controllers.values()) {
                if (controller.enabled && !createdControllers.has(controller))
                    controller.refresh({ reveal })
            }
        })
    }

    private getFileExplorerContainers(): Set<HTMLElement> {
        const containers = new Set<HTMLElement>()
        const leaves = this.app.workspace.getLeavesOfType('file-explorer')

        for (const leaf of leaves) {
            const viewRoot = leaf.view.containerEl
            if (!viewRoot || typeof viewRoot.querySelectorAll !== 'function') continue
            for (const container of Array.from(
                viewRoot.querySelectorAll<HTMLElement>('.nav-files-container')
            )) {
                containers.add(container)
            }
        }

        const workspaceRoot = this.app.workspace.containerEl
        if (workspaceRoot && typeof workspaceRoot.querySelectorAll === 'function') {
            for (const container of Array.from(
                workspaceRoot.querySelectorAll<HTMLElement>(
                    '.workspace-leaf-content[data-type="file-explorer"] .nav-files-container'
                )
            )) {
                containers.add(container)
            }
        }
        return containers
    }

    private enhanceFileExplorers(): Set<FileExplorerRail> {
        const createdControllers = new Set<FileExplorerRail>()
        if (this.unloading) return createdControllers
        const containers = this.getFileExplorerContainers()

        for (const container of containers) {
            this.enableDocument(getOwnerDocument(container))
            if (!this.controllers.has(container)) {
                const controller = new FileExplorerRail(this, container)
                this.controllers.set(container, controller)
                createdControllers.add(controller)
            } else {
                this.controllers.get(container)!.syncOwnerContext()
            }
        }

        for (const [container, controller] of Array.from(this.controllers.entries())) {
            if (!containers.has(container) || !isConnectedToOwnerDocument(container)) {
                controller.destroy()
                this.controllers.delete(container)
            } else if (!controller.enabled) {
                controller.setEnabled(controller.isVisible())
            }
        }

        const activeDocuments = new Set(
            Array.from(containers, (container) => getOwnerDocument(container))
        )
        activeDocuments.add(getOwnerDocument(this.app.workspace.containerEl))
        for (const ownerDocument of this.enabledDocuments) {
            if (activeDocuments.has(ownerDocument)) continue
            if (ownerDocument && ownerDocument.body) {
                ownerDocument.body.classList.remove('crisp-file-explorer-enabled')
            }
            this.enabledDocuments.delete(ownerDocument)
        }
        return createdControllers
    }
}
