export type RailItemType = 'file' | 'folder'

export interface RailItem {
    el: HTMLElement
    center: number
    path: string | null
    type: RailItemType
    active: boolean
    today: boolean
    magnet: boolean
    pinned: boolean
    renderedX: number | undefined
}

export type TickKind = 'short' | 'long'

export interface TickMark {
    y: number
    kind: TickKind
    itemIndex?: number
    isFile?: boolean
    isToday?: boolean
    isMagnet?: boolean
    isPinned?: boolean
    renderedTransform?: string
}

export type TickSide = -1 | 0 | 1
