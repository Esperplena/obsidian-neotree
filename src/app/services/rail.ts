import {
    ACTIVE_LABEL_TRANSLATE_X,
    DOT_SIZE,
    DRAG_SCROLL_EDGE_MARGIN,
    DRAG_SCROLL_MAX_STEP,
    DYNAMIC_RENDER_RADIUS,
    FOLDER_AUTO_EXPAND_DELAY_MS,
    LINE_WIDTH,
    MAGNET_RADIUS,
    MAGNET_STRENGTH,
    MAX_FRAME_DT,
    ORB_ROTATION_PER_PX,
    RAIL_FOCUS_HEIGHT,
    RAIL_LINE_PADDING,
    SCROLL_REVEAL_MARGIN,
    SMART_MAGNET_LIMIT,
    SPRING,
    TICK_FOLDER_WIDTH,
    TICK_LONG_WIDTH,
    TICK_SHORT_WIDTH,
    TICK_SIDE_HYSTERESIS
} from '../constants'
import { resolveOrbStyle, resolveSoundStyle, STATIC_ORB_STYLES } from '../domain/orb'
import { ORB_IMAGE_DATA_URLS, ORB_SVGS } from '../domain/orb-assets'
import type { RailItem, TickMark, TickSide } from '../types/rail.intf'
import {
    cancelOwnerFrame,
    clearOwnerTimeout,
    dispatchMouseSequence,
    getOwnerDocument,
    getOwnerWindow,
    isConnectedToOwnerDocument,
    prefersReducedMotion,
    requestOwnerFrame,
    setOwnerTimeout
} from '../utils/dom'
import {
    clamp,
    indexRangeAround,
    mix,
    morphProgress,
    nearestIndex,
    stepSpring,
    waveOffset
} from '../utils/math'
import type { NeotreePlugin } from '../plugin'

function getTickBaseWidth(tick: TickMark): number {
    if (tick.kind !== 'long') return TICK_SHORT_WIDTH
    return tick.isFile === false ? TICK_FOLDER_WIDTH : TICK_LONG_WIDTH
}

function mutationTouchesFileTree(mutations: MutationRecord[]): boolean {
    return mutations.some((mutation) => {
        if (!mutation.addedNodes.length && !mutation.removedNodes.length) return false
        const target = mutation.target
        return !(
            target &&
            typeof (target as Element).closest === 'function' &&
            (target as Element).closest('.crisp-fe-rail')
        )
    })
}

function buildTickMarks(items: RailItem[]): TickMark[] {
    const ticks: TickMark[] = []
    if (!items.length) return ticks

    const firstGap = items.length > 1 ? items[1]!.center - items[0]!.center : 0
    const lastGap =
        items.length > 1 ? items[items.length - 1]!.center - items[items.length - 2]!.center : 0
    if (firstGap > 0) {
        ticks.push({ y: items[0]!.center - firstGap / 3, kind: 'short' })
    }

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!
        ticks.push({
            y: item.center,
            kind: 'long',
            itemIndex: index,
            isFile: item.type === 'file',
            isToday: Boolean(item.today),
            isMagnet: Boolean(item.magnet),
            isPinned: Boolean(item.pinned)
        })

        const next = items[index + 1]
        if (!next) continue

        const gap = next.center - item.center
        if (gap >= 22) {
            ticks.push(
                { y: item.center + gap / 3, kind: 'short' },
                { y: item.center + (gap * 2) / 3, kind: 'short' }
            )
        }
    }
    if (lastGap > 0) {
        ticks.push({ y: items[items.length - 1]!.center + lastGap / 3, kind: 'short' })
    }
    return ticks
}

function hasStableTickTopology(
    previousItems: RailItem[],
    nextItems: RailItem[],
    previousTicks: TickMark[],
    nextTicks: TickMark[]
): boolean {
    if (previousItems.length !== nextItems.length || previousTicks.length !== nextTicks.length) {
        return false
    }

    for (let index = 0; index < nextItems.length; index += 1) {
        const previous = previousItems[index]!
        const next = nextItems[index]!
        if (previous.path !== next.path || previous.type !== next.type) return false
    }

    for (let index = 0; index < nextTicks.length; index += 1) {
        const previous = previousTicks[index]!
        const next = nextTicks[index]!
        if (previous.kind !== next.kind || previous.itemIndex !== next.itemIndex) return false
    }

    return true
}

function findVisibleAncestorItem(items: RailItem[], activePath: string | null): RailItem | null {
    if (!activePath) return null
    const parts = activePath.split('/')
    for (let index = parts.length - 1; index > 0; index -= 1) {
        const folderPath = parts.slice(0, index).join('/')
        const item = items.find(
            (candidate) => candidate.type === 'folder' && candidate.path === folderPath
        )
        if (item) return item
    }
    return null
}

function resolveOrbTarget(
    items: RailItem[],
    activeTargetItem: RailItem | null,
    hasCurrentPosition: boolean,
    currentPosition: number
): number {
    if (activeTargetItem) return activeTargetItem.center
    if (!items.length) return 0
    if (hasCurrentPosition) {
        return clamp(currentPosition, items[0]!.center, items[items.length - 1]!.center)
    }
    return items[0]!.center
}

const VISIBILITY_CACHE_MS = 200

export class FileExplorerRail {
    private plugin: NeotreePlugin
    private container: HTMLElement
    private ownerDocument: Document
    private ownerWindow: Window
    private items: RailItem[] = []
    private magnetItems: RailItem[] = []
    private tickMarks: TickMark[] = []
    private tickEls: HTMLDivElement[] = []
    private dynamicTickRange: [number, number] = [0, -1]
    private dynamicItemRange: [number, number] = [0, -1]
    private nearestTickIndex = -1
    private visualActiveIndex = -1
    private frame: number | null = null
    private displayY = 0
    private targetY = 0
    private velocity = 0
    private orbRotation = 0
    private hasOrbPosition = false
    private lastRenderViewportY: number | undefined = undefined
    private lastLineFocusTransform = ''
    private lastOrbTransform: string | null = null
    private lastBallTransform: string | null = null
    private visibilityCache: { result: boolean; at: number } | null = null
    private lastMeasuredWidth = 0
    private lastMeasuredHeight = 0
    private lastFrameTime: number | undefined = undefined
    private isDragging = false
    private dragPointerId: number | null = null
    private dragScrollFrame: number | null = null
    private dragPointerViewportY = 0
    private lastDragIndex = -1
    private autoExpandTimer: number | null = null
    private autoExpandFolderPath: string | null = null
    private autoExpandedFolderPaths = new Set<string>()
    private measureFrame: number | null = null
    private measureQueued = false
    private pendingReveal = false
    private tickSideMap = new Map<number, TickSide>()
    private destroyed = false
    enabled = true
    private mutationDebounceTimer: number | null = null
    private resizeObserver!: ResizeObserver
    private mutationObserver!: MutationObserver
    private orbBall: HTMLElement | null = null
    private rail!: HTMLDivElement
    private line!: HTMLDivElement
    private lineFocus!: HTMLDivElement
    private orb!: HTMLDivElement
    private ticks!: HTMLDivElement
    private onScroll: () => void
    private onPointerMove: (event: PointerEvent) => void
    private onPointerUp: (event: PointerEvent) => void
    private onWindowBlur: () => void

    constructor(plugin: NeotreePlugin, container: HTMLElement) {
        this.plugin = plugin
        this.container = container
        this.ownerDocument = getOwnerDocument(container)
        this.ownerWindow = getOwnerWindow(container)
        this.createObservers()
        this.onScroll = () => this.handleScroll()
        this.onPointerMove = (event) => this.handlePointerMove(event)
        this.onPointerUp = (event) => this.handlePointerUp(event)
        this.onWindowBlur = () => this.handleWindowBlur()

        this.rail = this.ownerDocument.createElement('div')
        this.rail.className = 'crisp-fe-rail'
        this.rail.setAttribute('aria-hidden', 'true')

        this.line = this.ownerDocument.createElement('div')
        this.line.className = 'crisp-fe-line'

        this.lineFocus = this.ownerDocument.createElement('div')
        this.lineFocus.className = 'crisp-fe-line-focus'
        this.line.appendChild(this.lineFocus)

        this.orb = this.ownerDocument.createElement('div')
        this.orb.className = 'crisp-fe-orb'
        this.orb.tabIndex = -1
        this.orb.addEventListener('pointerdown', (event) => this.handlePointerDown(event))
        this.updateOrbStyle()

        this.ticks = this.ownerDocument.createElement('div')
        this.ticks.className = 'crisp-fe-ticks'
        this.rail.appendChild(this.line)
        this.rail.appendChild(this.ticks)
        this.rail.appendChild(this.orb)

        this.container.classList.add('crisp-fe-container')
        this.container.appendChild(this.rail)
        this.container.addEventListener('scroll', this.onScroll, { passive: true })
        this.resizeObserver.observe(this.container)
        this.mutationObserver.observe(this.container, { childList: true, subtree: true })

        this.setEnabled(this.isVisible())
        this.refresh({ reveal: true, immediate: true })
    }

    private createObservers(): void {
        const resizeObserverClass =
            (this.ownerWindow as unknown as { ResizeObserver: typeof ResizeObserver })
                .ResizeObserver ?? ResizeObserver
        const mutationObserverClass =
            (this.ownerWindow as unknown as { MutationObserver: typeof MutationObserver })
                .MutationObserver ?? MutationObserver
        this.resizeObserver = new resizeObserverClass(() => this.scheduleRefresh())
        this.mutationObserver = new mutationObserverClass((mutations: MutationRecord[]) => {
            if (mutationTouchesFileTree(mutations)) {
                clearOwnerTimeout(this.container, this.mutationDebounceTimer)
                this.mutationDebounceTimer = setOwnerTimeout(
                    this.container,
                    () => {
                        this.mutationDebounceTimer = null
                        this.scheduleRefresh()
                    },
                    80
                )
            }
        })
    }

    syncOwnerContext(): boolean {
        const nextDocument = getOwnerDocument(this.container)
        const nextWindow = getOwnerWindow(this.container)
        if (nextDocument === this.ownerDocument && nextWindow === this.ownerWindow) return false

        this.resizeObserver.disconnect()
        this.mutationObserver.disconnect()
        this.ownerDocument = nextDocument
        this.ownerWindow = nextWindow
        this.createObservers()
        this.resizeObserver.observe(this.container)
        this.mutationObserver.observe(this.container, { childList: true, subtree: true })
        this.plugin.enableDocument(this.ownerDocument)
        return true
    }

    updateOrbStyle(): void {
        const style = resolveOrbStyle(this.plugin.settings.orbStyle)
        this.orb.dataset['orbStyle'] = style
        this.orb.empty()
        this.lastRenderViewportY = this.displayY - this.container.scrollTop
        // 小球元素被替换，旋转缓存作废，下次渲染需重新写入。
        this.lastBallTransform = null

        const imageDataUrl = ORB_IMAGE_DATA_URLS[style]
        if (imageDataUrl) {
            const ownerDocument = getOwnerDocument(this.container)
            const spinner = ownerDocument.createElement('span')
            spinner.className = 'crisp-fe-orb-ball crisp-fe-orb-spinner'
            const img = ownerDocument.createElement('img')
            img.className = 'crisp-fe-orb-image'
            img.alt = ''
            img.draggable = false
            img.src = imageDataUrl
            img.addEventListener(
                'error',
                () => {
                    if (this.orbBall !== spinner) return
                    this.orb.empty()
                    this.orb.dataset['orbStyle'] = 'default'
                    this.orbBall = null
                    this.requestFrame()
                },
                { once: true }
            )
            spinner.appendChild(img)
            this.orb.appendChild(spinner)
            this.orbBall = spinner
            return
        }

        // eslint-disable-next-line @microsoft/sdl/no-inner-html -- reason: trusted bundled SVG artwork, no user input
        this.orb.innerHTML = ORB_SVGS[style] ?? ''
        this.orbBall = this.orb.querySelector('.crisp-fe-orb-ball')
    }

    destroy(): void {
        this.destroyed = true
        cancelOwnerFrame(this.container, this.frame)
        cancelOwnerFrame(this.container, this.measureFrame)
        cancelOwnerFrame(this.container, this.dragScrollFrame)
        this.clearAutoExpandTimer()
        this.frame = null
        this.measureFrame = null
        this.dragScrollFrame = null
        this.resizeObserver.disconnect()
        this.mutationObserver.disconnect()
        this.container.removeEventListener('scroll', this.onScroll)
        if (this.mutationDebounceTimer) {
            clearOwnerTimeout(this.container, this.mutationDebounceTimer)
            this.mutationDebounceTimer = null
        }

        // 使用统一的清理方法，确保完全移除
        this.releasePointerCapture()
        this.cleanupDragListeners()

        for (const item of this.items) {
            this.resetItem(item.el)
        }

        this.rail.remove()
        this.container.classList.remove(
            'crisp-fe-container',
            'crisp-fe-container-active',
            'crisp-fe-is-dragging'
        )
    }

    isVisible(): boolean {
        const now = performance.now()
        if (this.visibilityCache && now - this.visibilityCache.at < VISIBILITY_CACHE_MS) {
            return this.visibilityCache.result
        }
        const result = this.computeVisibility()
        this.visibilityCache = { result, at: now }
        return result
    }

    private computeVisibility(): boolean {
        if (!isConnectedToOwnerDocument(this.container)) return false

        const leafContent = this.container.closest(
            '.workspace-leaf-content[data-type="file-explorer"]'
        )
        if (!leafContent) return false

        if (typeof this.container.checkVisibility === 'function') {
            try {
                if (!this.container.checkVisibility({ checkVisibilityCSS: true })) return false
            } catch {
                if (!this.container.checkVisibility()) return false
            }
        }

        const containerStyle = this.ownerWindow.getComputedStyle(this.container)
        const leafStyle = this.ownerWindow.getComputedStyle(leafContent)
        if (
            containerStyle.display === 'none' ||
            containerStyle.visibility === 'hidden' ||
            leafStyle.display === 'none' ||
            leafStyle.visibility === 'hidden'
        ) {
            return false
        }

        const containerRect = this.container.getBoundingClientRect()
        const leafRect = leafContent.getBoundingClientRect()
        return (
            containerRect.width > 0 &&
            containerRect.height > 0 &&
            leafRect.width > 0 &&
            leafRect.height > 0
        )
    }

    setEnabled(enabled: boolean): void {
        const next = Boolean(enabled)
        this.enabled = next
        this.rail.hidden = !next
        this.container.classList.toggle('crisp-fe-container-active', next)

        if (!next) {
            cancelOwnerFrame(this.container, this.frame)
            cancelOwnerFrame(this.container, this.measureFrame)
            cancelOwnerFrame(this.container, this.dragScrollFrame)
            this.clearAutoExpandTimer()
            this.frame = null
            this.measureFrame = null
            this.dragScrollFrame = null
            this.measureQueued = false
            this.pendingReveal = false
            this.lastFrameTime = undefined
            this.lastOrbTransform = null
            this.lastBallTransform = null
            this.visibilityCache = null
            this.releasePointerCapture()
            this.setDragging(false)
            this.dragPointerId = null
            this.cleanupDragListeners()
            this.tickSideMap.clear()
            this.autoExpandedFolderPaths.clear()
            const [dynamicStart, dynamicEnd] = this.dynamicItemRange
            for (let index = dynamicStart; index <= dynamicEnd; index += 1) {
                const item = this.items[index]
                if (!item) continue
                item.el.style.removeProperty('translate')
                item.renderedX = undefined
            }
            this.dynamicTickRange = [0, -1]
            this.dynamicItemRange = [0, -1]
            this.nearestTickIndex = -1
            this.visualActiveIndex = -1
        }
    }

    private resetItem(el: HTMLElement): void {
        el.classList.remove(
            'crisp-fe-item',
            'crisp-fe-active',
            'crisp-fe-folder',
            'crisp-fe-file',
            'crisp-fe-magnet',
            'crisp-fe-today'
        )
        el.style.removeProperty('translate')
    }

    private handleScroll(): void {
        this.lastRenderViewportY = this.displayY - this.container.scrollTop
        if (this.isDragging) this.scheduleDragScroll()
    }

    private setDragging(active: boolean): void {
        this.isDragging = Boolean(active)
        this.orb.classList.toggle('is-dragging', this.isDragging)
        this.container.classList.toggle('crisp-fe-is-dragging', this.isDragging)
    }

    private cancelDragInteraction(): boolean {
        const hasPointer = this.dragPointerId !== null && this.dragPointerId !== undefined
        const wasActive = this.isDragging || hasPointer
        if (!wasActive) return false
        this.setDragging(false)
        this.releasePointerCapture()
        this.dragPointerId = null
        this.cancelDragScroll()
        this.clearAutoExpandTimer()
        this.cleanupDragListeners()
        this.autoExpandedFolderPaths.clear()
        this.velocity = 0
        return true
    }

    private syncEmptyState(itemCount: number): void {
        const isEmpty = itemCount === 0
        this.rail.classList.toggle('is-empty', isEmpty)
        if (!isEmpty) return
        if (this.isDragging) this.cancelDragInteraction()
        this.displayY = 0
        this.targetY = 0
        this.velocity = 0
        this.hasOrbPosition = false
        this.lastRenderViewportY = undefined
    }

    scheduleRefresh(options: { reveal?: boolean } = {}): void {
        if (this.destroyed || !this.enabled) return
        this.pendingReveal = this.pendingReveal || Boolean(options.reveal)
        if (this.measureQueued) return

        this.measureQueued = true
        this.measureFrame = requestOwnerFrame(this.container, () => {
            this.measureFrame = null
            this.measureQueued = false
            const reveal = this.pendingReveal
            this.pendingReveal = false
            this.refresh({ reveal })
        })
    }

    refresh(options: { reveal?: boolean; immediate?: boolean } = {}): void {
        if (this.destroyed || !isConnectedToOwnerDocument(this.container)) return
        this.syncOwnerContext()
        if (!this.isVisible()) {
            this.setEnabled(false)
            return
        }
        this.setEnabled(true)
        const resolvedOrbStyle = resolveOrbStyle(this.plugin.settings.orbStyle)
        if (this.orb.dataset['orbStyle'] !== resolvedOrbStyle) this.updateOrbStyle()

        const previousItems = this.items
        const previousTickMarks = this.tickMarks
        const hadOrbPosition = this.hasOrbPosition
        const previousViewportY = hadOrbPosition ? this.displayY - this.container.scrollTop : 0
        const titles = Array.from(
            this.container.querySelectorAll<HTMLElement>('.nav-file-title, .nav-folder-title')
        ).filter((el) => !el.closest('.crisp-fe-rail'))

        const activeFile = this.plugin.app.workspace.getActiveFile()
        const activePath = activeFile ? activeFile.path : null
        const todayPaths = this.plugin.getTodayPathSet()
        const frequentPaths = this.plugin.getFrequentPathSet()
        const pinnedPaths = this.plugin.getPinnedPathSet()

        const candidates: Array<{ el: HTMLElement; isFolder: boolean }> = []
        for (const el of titles) {
            const isFolder = el.classList.contains('nav-folder-title')
            if (isFolder && !this.plugin.settings.includeFolders) {
                this.resetItem(el)
                continue
            }
            candidates.push({ el, isFolder })
        }

        // 若元素集合与上次完全一致（顺序、数量相同）且容器尺寸未变，说明文件树
        // 没有增删、布局未变，直接复用上次测得的中心点，避免对每条目强制同步布局。
        const canReuseCenters =
            this.container.clientWidth === this.lastMeasuredWidth &&
            this.container.clientHeight === this.lastMeasuredHeight &&
            previousItems.length === candidates.length &&
            previousItems.every((item, index) => item.el === candidates[index]!.el)

        let containerRect: DOMRect | null = null
        let rects: DOMRect[] | null = null
        if (!canReuseCenters) {
            this.lastMeasuredWidth = this.container.clientWidth
            this.lastMeasuredHeight = this.container.clientHeight
            containerRect = this.container.getBoundingClientRect()
            rects = candidates.map(({ el }) => el.getBoundingClientRect())
        }
        const nextItems: RailItem[] = []

        for (let index = 0; index < candidates.length; index += 1) {
            const { el, isFolder } = candidates[index]!
            let center: number
            if (canReuseCenters) {
                center = previousItems[index]!.center
            } else {
                const rect = rects![index]!
                if (rect.height === 0) continue
                center = rect.top - containerRect!.top + this.container.scrollTop + rect.height / 2
            }

            const path = el.getAttribute('data-path')
            const type = isFolder ? 'folder' : 'file'
            const active = type === 'file' && !!path && path === activePath
            const today = type === 'file' && !!path && todayPaths.has(path)
            const pinned = type === 'file' && !!path && pinnedPaths.has(path)
            const magnet = type === 'file' && !!path && (pinned || frequentPaths.has(path))

            nextItems.push({
                el,
                center,
                path,
                type,
                active,
                today,
                magnet,
                pinned,
                renderedX: undefined
            })
        }

        for (const item of nextItems) {
            if (!item.el.classList.contains('crisp-fe-item')) {
                item.el.classList.add(
                    'crisp-fe-item',
                    item.type === 'folder' ? 'crisp-fe-folder' : 'crisp-fe-file'
                )
            }
            const isActive = Boolean(item.active)
            if (item.el.classList.contains('crisp-fe-active') !== isActive) {
                item.el.classList.toggle('crisp-fe-active', isActive)
            }
            const isToday = Boolean(item.today)
            if (item.el.classList.contains('crisp-fe-today') !== isToday) {
                item.el.classList.toggle('crisp-fe-today', isToday)
            }
            const isMagnet = Boolean(item.magnet)
            if (item.el.classList.contains('crisp-fe-magnet') !== isMagnet) {
                item.el.classList.toggle('crisp-fe-magnet', isMagnet)
            }
        }

        const nextEls = new Set(nextItems.map((item) => item.el))
        for (const item of previousItems) {
            if (!nextEls.has(item.el)) {
                this.resetItem(item.el)
            }
        }

        const [previousDynamicStart, previousDynamicEnd] = this.dynamicItemRange
        for (let index = previousDynamicStart; index <= previousDynamicEnd; index += 1) {
            const item = previousItems[index]
            if (item) item.el.style.removeProperty('translate')
        }

        const nextTickMarks = buildTickMarks(nextItems)
        const preserveTickMotion = hasStableTickTopology(
            previousItems,
            nextItems,
            previousTickMarks,
            nextTickMarks
        )

        this.items = nextItems
        this.magnetItems = nextItems.filter((item) => item.magnet).slice(0, SMART_MAGNET_LIMIT)
        this.visualActiveIndex = nextItems.findIndex((item) => item.active)
        this.dynamicItemRange = [0, -1]
        if (!preserveTickMotion) {
            this.dynamicTickRange = [0, -1]
            this.nearestTickIndex = -1
        }
        this.syncEmptyState(this.items.length)
        this.tickMarks = nextTickMarks
        this.container.style.setProperty(
            '--crisp-fe-height',
            `${Math.max(this.container.scrollHeight, this.container.clientHeight)}px`
        )
        this.updateRailLineBounds()
        this.syncTickElements({ preserveMotion: preserveTickMotion })

        if (this.syncDragPositionAfterMeasure()) {
            if (!preserveTickMotion) this.render()
            return
        }

        const activeItem = this.visualActiveIndex >= 0 ? this.items[this.visualActiveIndex] : null
        const activeTargetItem = activeItem || findVisibleAncestorItem(this.items, activePath)
        if (activeTargetItem && this.visualActiveIndex < 0) {
            this.visualActiveIndex = this.items.indexOf(activeTargetItem)
        }
        const hasCurrentPosition = hadOrbPosition
        const currentPosition = this.targetY || this.displayY
        const first = this.items[0]
        const last = this.items[this.items.length - 1]
        const clampedCurrentPosition =
            first && last ? clamp(currentPosition, first.center, last.center) : currentPosition
        const nextTarget = resolveOrbTarget(
            this.items,
            activeTargetItem,
            hasCurrentPosition,
            clampedCurrentPosition
        )
        if (activeItem && options.reveal) {
            this.ensureItemVisible(activeItem)
        }
        this.targetY = nextTarget
        if (hadOrbPosition && !options.immediate && !this.isDragging && first && last) {
            this.displayY = clamp(
                this.container.scrollTop + previousViewportY,
                first.center,
                last.center
            )
        } else if (!hadOrbPosition) {
            this.displayY = nextTarget
        }
        if (options.immediate || prefersReducedMotion.matches) {
            this.displayY = nextTarget
            this.velocity = 0
        }
        this.hasOrbPosition = Boolean(this.items.length)
        if (!preserveTickMotion) this.render()
        this.requestFrame()
    }

    private updateRailLineBounds(): void {
        if (!this.items.length) {
            // `.crisp-fe-line` 的基线高度就是 0（见 src/styles.src.css），空态无需额外设置。
            this.lastLineFocusTransform = ''
            return
        }

        const first = this.items[0]!
        const last = this.items[this.items.length - 1]!
        const top = Math.max(0, first.center - RAIL_LINE_PADDING)
        const bottom = Math.max(top, last.center + RAIL_LINE_PADDING)
        const height = Math.max(1, bottom - top)
        this.line.style.top = `${top}px`
        this.line.style.height = `${height}px`
        this.updateRailLineFocus()
    }

    private syncTickElements(options: { preserveMotion?: boolean } = {}): void {
        const preserveMotion = Boolean(options.preserveMotion)
        while (this.tickEls.length < this.tickMarks.length) {
            const ownerDocument = getOwnerDocument(this.container)
            const tick = ownerDocument.createElement('div')
            tick.className = 'crisp-fe-tick'
            this.ticks.appendChild(tick)
            this.tickEls.push(tick)
        }

        while (this.tickEls.length > this.tickMarks.length) {
            const tick = this.tickEls.pop()
            tick?.remove()
        }

        for (let index = 0; index < this.tickMarks.length; index += 1) {
            const mark = this.tickMarks[index]!
            const el = this.tickEls[index]!
            const top = `${mark.y}px`
            if (el.style.top !== top) el.style.top = top
            if (el.style.width !== `${LINE_WIDTH}px`) {
                el.style.width = `${LINE_WIDTH}px`
            }
            el.classList.add('crisp-fe-tick')
            el.classList.toggle('is-long', mark.kind === 'long')
            el.classList.toggle('is-short', mark.kind !== 'long')
            el.classList.toggle('is-folder', mark.isFile === false)
            el.classList.toggle('is-file', mark.isFile !== false)
            el.classList.toggle('is-today', Boolean(mark.isToday))
            el.classList.toggle('is-magnet', Boolean(mark.isMagnet))
            el.classList.toggle('is-pinned', Boolean(mark.isPinned))

            const baseTransform = `translate3d(0px, -50%, 0) scaleX(${getTickBaseWidth(mark) / LINE_WIDTH})`
            if (!preserveMotion) {
                el.classList.remove('is-line', 'is-nearest')
                this.tickSideMap.delete(index)
            }
            if (!preserveMotion || !el.style.transform) {
                if (el.style.transform !== baseTransform) el.style.transform = baseTransform
            }
            mark.renderedTransform = el.style.transform || baseTransform
        }
    }

    private ensureItemVisible(item: RailItem): boolean {
        const visibleTop = this.container.scrollTop + SCROLL_REVEAL_MARGIN
        const visibleBottom =
            this.container.scrollTop + this.container.clientHeight - SCROLL_REVEAL_MARGIN
        if (item.center >= visibleTop && item.center <= visibleBottom) return false

        const nextTop = clamp(
            item.center - this.container.clientHeight / 2,
            0,
            Math.max(0, this.container.scrollHeight - this.container.clientHeight)
        )

        this.container.scrollTop = nextTop
        return true
    }

    private syncDragPositionAfterMeasure(): boolean {
        if (!this.isDragging || !this.items.length) return false
        const first = this.items[0]!
        const last = this.items[this.items.length - 1]!
        const pointerY = this.container.scrollTop + this.dragPointerViewportY
        const y = this.applyMagnet(clamp(pointerY, first.center, last.center))
        this.lastDragIndex = -1
        this.applyDragY(y)
        return true
    }

    requestFrame(): void {
        if (this.destroyed || this.enabled === false || this.frame) return
        this.frame = requestOwnerFrame(this.container, (time) => this.animate(time))
    }

    private isSettled(): boolean {
        return (
            !this.isDragging &&
            Math.abs(this.targetY - this.displayY) < SPRING.restDelta &&
            Math.abs(this.velocity) < SPRING.restSpeed
        )
    }

    private animate(timestamp: number): void {
        const lastTime = this.lastFrameTime
        this.lastFrameTime = timestamp
        const dt =
            lastTime === undefined ? 1 / 60 : Math.min((timestamp - lastTime) / 1000, MAX_FRAME_DT)

        if (!this.isDragging) {
            if (prefersReducedMotion.matches) {
                this.displayY = this.targetY
                this.velocity = 0
            } else {
                const next = stepSpring(
                    { position: this.displayY, velocity: this.velocity },
                    this.targetY,
                    dt
                )
                this.displayY = next.position
                this.velocity = next.velocity
            }
        }

        this.render()
        if (this.isSettled()) {
            this.frame = null
            this.lastFrameTime = undefined
            return
        }
        this.frame = requestOwnerFrame(this.container, (time) => this.animate(time))
    }

    private render(): void {
        this.updateRailLineFocus()
        const orbTransform = `translate3d(0, ${this.displayY}px, 0)`
        if (this.lastOrbTransform !== orbTransform) {
            this.orb.style.transform = orbTransform
            this.lastOrbTransform = orbTransform
        }
        this.renderOrbBall()

        const nearestTick = nearestIndex(this.tickMarks, this.displayY, 'y')
        if (!this.isDragging && this.tickSideMap.size > 0) this.tickSideMap.clear()

        const nextTickRange = indexRangeAround(
            this.tickMarks,
            this.displayY,
            DYNAMIC_RENDER_RADIUS,
            'y'
        )
        const [previousTickStart, previousTickEnd] = this.dynamicTickRange
        const [nextTickStart, nextTickEnd] = nextTickRange
        for (let index = previousTickStart; index <= previousTickEnd; index += 1) {
            if (index >= nextTickStart && index <= nextTickEnd) continue
            const tick = this.tickMarks[index]
            const el = this.tickEls[index]
            if (!tick || !el) continue
            el.classList.remove('is-line', 'is-nearest')
            const baseTransform = `translate3d(0px, -50%, 0) scaleX(${getTickBaseWidth(tick) / LINE_WIDTH})`
            if (tick.renderedTransform !== baseTransform) {
                el.style.transform = baseTransform
                tick.renderedTransform = baseTransform
            }
            this.tickSideMap.delete(index)
        }
        if (this.nearestTickIndex >= 0 && this.nearestTickIndex !== nearestTick) {
            const previousNearest = this.tickEls[this.nearestTickIndex]
            if (previousNearest) previousNearest.classList.remove('is-nearest')
        }

        for (let index = nextTickStart; index <= nextTickEnd; index += 1) {
            const tick = this.tickMarks[index]
            const el = this.tickEls[index]
            if (!tick || !el) continue
            const distance = tick.y - this.displayY
            const progress = tick.itemIndex === undefined ? 0 : morphProgress(distance)
            const baseWidth = getTickBaseWidth(tick)
            const width = mix(baseWidth, LINE_WIDTH, progress)
            const x = mix(waveOffset(this.displayY, tick.y), DOT_SIZE + 15, progress)

            if (this.isDragging) {
                const previousSide = this.tickSideMap.get(index)
                let currentSide: TickSide = previousSide ?? 0
                if (distance >= TICK_SIDE_HYSTERESIS) {
                    currentSide = 1
                } else if (distance <= -TICK_SIDE_HYSTERESIS) {
                    currentSide = -1
                }
                if (
                    this.plugin.settings.soundEnabled &&
                    previousSide !== undefined &&
                    currentSide !== previousSide &&
                    !prefersReducedMotion.matches
                ) {
                    const dragProgress = index / Math.max(1, this.tickEls.length - 1)
                    this.plugin.audio.tick(
                        resolveSoundStyle(
                            this.plugin.settings.soundStyle,
                            this.orb.dataset['orbStyle'] ?? ''
                        ),
                        dragProgress,
                        this.plugin.settings.pitchScaleEnabled,
                        this.ownerWindow
                    )
                }
                this.tickSideMap.set(index, currentSide)
            }

            el.classList.toggle('is-line', progress > 0.5)
            el.classList.toggle('is-nearest', index === nearestTick)
            const scaleX = width / LINE_WIDTH
            const transformValue = `translate3d(${x}px, -50%, 0) scaleX(${scaleX})`
            if (tick.renderedTransform !== transformValue) {
                el.style.transform = transformValue
                tick.renderedTransform = transformValue
            }
        }
        this.dynamicTickRange = nextTickRange
        this.nearestTickIndex = nearestTick

        const nextItemRange = indexRangeAround(this.items, this.displayY, DYNAMIC_RENDER_RADIUS)
        const [previousItemStart, previousItemEnd] = this.dynamicItemRange
        const [nextItemStart, nextItemEnd] = nextItemRange
        for (let index = previousItemStart; index <= previousItemEnd; index += 1) {
            if (index >= nextItemStart && index <= nextItemEnd) continue
            const item = this.items[index]
            if (!item || item.renderedX === undefined) continue
            item.el.style.removeProperty('translate')
            item.renderedX = undefined
        }

        for (let index = nextItemStart; index <= nextItemEnd; index += 1) {
            const item = this.items[index]
            if (!item) continue
            let x = 0
            if (this.isDragging) {
                const distance = item.center - this.displayY
                const progress = morphProgress(distance)
                x = mix(waveOffset(this.displayY, item.center), ACTIVE_LABEL_TRANSLATE_X, progress)
            } else if (item.active || this.visualActiveIndex === index) {
                x = ACTIVE_LABEL_TRANSLATE_X
            }

            if (item.renderedX === x) continue
            if (x === 0) {
                item.el.style.removeProperty('translate')
                item.renderedX = undefined
            } else {
                item.el.style.translate = `${x}px 0px`
                item.renderedX = x
            }
        }
        this.dynamicItemRange = nextItemRange
    }

    private renderOrbBall(): void {
        const ball = this.orbBall ?? this.orb.querySelector('.crisp-fe-orb-ball')
        const viewportY = this.displayY - this.container.scrollTop
        if (!ball) {
            this.lastRenderViewportY = viewportY
            return
        }

        if (STATIC_ORB_STYLES.has(this.orb.dataset['orbStyle'] ?? '')) {
            this.lastRenderViewportY = viewportY
            if (this.lastBallTransform !== null) {
                ball.style.removeProperty('transform')
                this.lastBallTransform = null
            }
            return
        }

        if (this.lastRenderViewportY !== undefined && !prefersReducedMotion.matches) {
            this.orbRotation += (viewportY - this.lastRenderViewportY) * ORB_ROTATION_PER_PX
        }
        this.lastRenderViewportY = viewportY
        const nextTransform = prefersReducedMotion.matches
            ? 'none'
            : `rotate(${this.orbRotation}deg)`
        if (this.lastBallTransform !== nextTransform) {
            ball.style.transform = nextTransform
            this.lastBallTransform = nextTransform
        }
    }

    private updateRailLineFocus(): void {
        if (!this.items.length) return

        const first = this.items[0]!
        const top = Math.max(0, first.center - RAIL_LINE_PADDING)
        const focusY = this.displayY - top - RAIL_FOCUS_HEIGHT / 2
        const transform = `translate3d(0px, ${focusY}px, 0)`
        if (transform === this.lastLineFocusTransform) return
        this.lineFocus.style.transform = transform
        this.lastLineFocusTransform = transform
    }

    private handlePointerDown(event: PointerEvent): void {
        const isSecondaryPointer = typeof event.button === 'number' && event.button !== 0
        if (
            this.isDragging ||
            !this.items.length ||
            event.isPrimary === false ||
            isSecondaryPointer
        )
            return
        event.preventDefault()
        event.stopPropagation()

        // 先清理可能残留的监听器，避免重复绑定
        this.cleanupDragListeners()

        this.setDragging(true)
        this.dragPointerId = event.pointerId
        this.velocity = 0
        this.lastDragIndex = -1
        this.tickSideMap.clear()

        try {
            this.orb.setPointerCapture(event.pointerId)
        } catch (error) {
            console.debug('Crisp File Explorer: setPointerCapture failed', error)
        }

        this.updateDrag(event)
        this.requestFrame()

        // 使用 bubble phase（默认），不用 capture，避免拦截其他面板的事件
        this.ownerWindow.addEventListener('pointermove', this.onPointerMove, { passive: false })
        this.ownerWindow.addEventListener('pointerup', this.onPointerUp, { passive: false })
        this.ownerWindow.addEventListener('pointercancel', this.onPointerUp, { passive: false })
        this.ownerWindow.addEventListener('blur', this.onWindowBlur)
    }

    private cleanupDragListeners(): void {
        // 只清理 bubble 模式的监听器（不再使用 capture）
        this.ownerWindow.removeEventListener('pointermove', this.onPointerMove, false)
        this.ownerWindow.removeEventListener('pointerup', this.onPointerUp, false)
        this.ownerWindow.removeEventListener('pointercancel', this.onPointerUp, false)
        this.ownerWindow.removeEventListener('blur', this.onWindowBlur, false)
    }

    private cancelDragScroll(): void {
        cancelOwnerFrame(this.container, this.dragScrollFrame)
        this.dragScrollFrame = null
    }

    private clearAutoExpandTimer(): void {
        clearOwnerTimeout(this.container, this.autoExpandTimer)
        this.autoExpandTimer = null
        this.autoExpandFolderPath = null
    }

    private releasePointerCapture(): void {
        if (this.dragPointerId === null || this.dragPointerId === undefined) return
        try {
            this.orb.releasePointerCapture(this.dragPointerId)
        } catch {
            // Pointer capture may already be released by the host window.
        }
    }

    private handlePointerMove(event: PointerEvent): void {
        if (this.destroyed || !this.isDragging || event.pointerId !== this.dragPointerId) return
        // 只在确认是拖动事件时才 preventDefault
        event.preventDefault()
        event.stopPropagation()
        this.updateDrag(event)
    }

    private handleWindowBlur(): void {
        if (!this.cancelDragInteraction()) return
        if (this.plugin && typeof this.plugin.scheduleRefresh === 'function') {
            this.plugin.scheduleRefresh()
        }
        this.requestFrame()
    }

    private handlePointerUp(event: PointerEvent): void {
        if (this.destroyed || !this.isDragging || event.pointerId !== this.dragPointerId) return
        // 只在确认是拖动事件时才 preventDefault
        event.preventDefault()
        event.stopPropagation()

        const cancelled = event.type === 'pointercancel'
        if (!cancelled) this.updateDrag(event)
        this.setDragging(false)
        this.releasePointerCapture()
        this.dragPointerId = null
        this.cancelDragScroll()
        this.clearAutoExpandTimer()

        // 立即清理所有全局监听器
        this.cleanupDragListeners()

        if (cancelled) {
            this.autoExpandedFolderPaths.clear()
            if (this.plugin && typeof this.plugin.scheduleRefresh === 'function') {
                this.plugin.scheduleRefresh()
            }
            this.requestFrame()
            return
        }

        const index = nearestIndex(this.items, this.displayY)
        const item = this.items[index]
        if (item && this.plugin.settings.releaseSoundEnabled && !prefersReducedMotion.matches) {
            this.plugin.audio.release(
                resolveSoundStyle(
                    this.plugin.settings.soundStyle,
                    this.orb.dataset['orbStyle'] ?? ''
                ),
                this.ownerWindow
            )
        }
        if (item && this.plugin.settings.openOnDragRelease) {
            const skipAutoExpandedFolder =
                item.type === 'folder' && this.autoExpandedFolderPaths.has(item.path ?? '')
            if (!skipAutoExpandedFolder) {
                this.plugin.lockInteraction()
                dispatchMouseSequence(item.el)
            }
        }
        this.autoExpandedFolderPaths.clear()
        this.requestFrame()
    }

    private updateDrag(event: PointerEvent): void {
        const first = this.items[0]
        const last = this.items[this.items.length - 1]
        if (!first || !last) return

        const rect = this.container.getBoundingClientRect()
        this.dragPointerViewportY = event.clientY - rect.top
        const pointerY = this.dragPointerViewportY + this.container.scrollTop
        const y = this.applyMagnet(clamp(pointerY, first.center, last.center))
        this.applyDragY(y)
        this.scheduleDragScroll()
    }

    private applyMagnet(y: number): number {
        if (!this.plugin.settings.frequentMagnetsEnabled) return y
        let nearestMagnet: RailItem | null = null
        let nearestDistance = Infinity

        for (const item of this.magnetItems || []) {
            const distance = Math.abs(item.center - y)
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestMagnet = item
            }
        }

        if (!nearestMagnet || nearestDistance > MAGNET_RADIUS) return y
        const pressure = 1 - nearestDistance / MAGNET_RADIUS
        return mix(y, nearestMagnet.center, pressure * MAGNET_STRENGTH)
    }

    private applyDragY(y: number): void {
        this.displayY = y
        this.targetY = y
        this.velocity = 0
        this.hasOrbPosition = true

        const index = nearestIndex(this.items, y)
        if (index === this.lastDragIndex) {
            this.requestFrame()
            return
        }
        this.lastDragIndex = index
        const previousActive = this.items[this.visualActiveIndex]
        if (previousActive && this.visualActiveIndex !== index) {
            previousActive.el.classList.toggle('crisp-fe-active', false)
        }
        const nextActive = this.items[index]
        if (nextActive) nextActive.el.classList.toggle('crisp-fe-active', true)
        this.visualActiveIndex = index
        this.queueFolderAutoExpand(this.items[index])

        this.requestFrame()
    }

    private queueFolderAutoExpand(item: RailItem | undefined): void {
        if (
            !this.plugin.settings.autoExpandFoldersOnDrag ||
            !this.isDragging ||
            !item ||
            item.type !== 'folder' ||
            !item.path
        ) {
            this.clearAutoExpandTimer()
            return
        }
        if (this.autoExpandFolderPath === item.path) return

        this.clearAutoExpandTimer()
        this.autoExpandFolderPath = item.path
        this.autoExpandTimer = setOwnerTimeout(
            this.container,
            () => {
                const folderPath = this.autoExpandFolderPath
                this.clearAutoExpandTimer()
                if (!this.isDragging || !folderPath) return
                if (this.plugin.expandFolderInExplorers(folderPath)) {
                    this.autoExpandedFolderPaths.add(folderPath)
                    this.scheduleRefresh()
                }
            },
            FOLDER_AUTO_EXPAND_DELAY_MS
        )
    }

    private scheduleDragScroll(): void {
        if (this.dragScrollFrame || !this.isDragging) return
        this.dragScrollFrame = requestOwnerFrame(this.container, () => {
            this.dragScrollFrame = null
            this.performDragScroll()
        })
    }

    private performDragScroll(): void {
        if (!this.isDragging || !this.items.length) return

        const height = this.container.clientHeight
        const pointerY = clamp(this.dragPointerViewportY, 0, height)
        let direction = 0
        let pressure = 0

        if (pointerY < DRAG_SCROLL_EDGE_MARGIN) {
            direction = -1
            pressure = (DRAG_SCROLL_EDGE_MARGIN - pointerY) / DRAG_SCROLL_EDGE_MARGIN
        } else if (pointerY > height - DRAG_SCROLL_EDGE_MARGIN) {
            direction = 1
            pressure = (pointerY - (height - DRAG_SCROLL_EDGE_MARGIN)) / DRAG_SCROLL_EDGE_MARGIN
        }

        if (!direction) return

        const maxScrollTop = Math.max(0, this.container.scrollHeight - this.container.clientHeight)
        const delta = direction * DRAG_SCROLL_MAX_STEP * pressure * pressure
        const nextScrollTop = clamp(this.container.scrollTop + delta, 0, maxScrollTop)
        if (Math.abs(nextScrollTop - this.container.scrollTop) < 0.5) return

        this.container.scrollTop = nextScrollTop
        const first = this.items[0]
        const last = this.items[this.items.length - 1]
        if (first && last) {
            this.applyDragY(
                this.applyMagnet(
                    clamp(this.container.scrollTop + pointerY, first.center, last.center)
                )
            )
        }
        this.scheduleDragScroll()
    }
}
