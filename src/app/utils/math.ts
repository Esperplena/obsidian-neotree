import { BULGE_AMPLITUDE, BULGE_SIGMA, MORPH_RADIUS, SPRING } from '../constants'

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function mix(from: number, to: number, progress: number): number {
    return from + (to - from) * progress
}

export function morphProgress(distance: number): number {
    const t = clamp(1 - Math.abs(distance) / MORPH_RADIUS, 0, 1)
    return t * t * (3 - 2 * t)
}

export function gaussianInfluence(distance: number, sigma: number): number {
    return Math.exp(-(distance * distance) / (2 * sigma * sigma))
}

export function waveOffset(dotY: number, y: number): number {
    return gaussianInfluence(y - dotY, BULGE_SIGMA) * BULGE_AMPLITUDE
}

export interface SpringState {
    position: number
    velocity: number
}

export function stepSpring(state: SpringState, target: number, dt: number): SpringState {
    const displacement = target - state.position
    const velocity =
        state.velocity + (SPRING.stiffness * displacement - SPRING.damping * state.velocity) * dt
    const position = state.position + velocity * dt

    if (Math.abs(target - position) < SPRING.restDelta && Math.abs(velocity) < SPRING.restSpeed) {
        return { position: target, velocity: 0 }
    }

    return { position, velocity }
}

type Indexable = { center: number } | { y: number }

function centerOf(item: Indexable, centerKey: 'center' | 'y'): number {
    return centerKey === 'y' ? (item as { y: number }).y : (item as { center: number }).center
}

export function nearestIndex(
    items: Indexable[],
    y: number,
    centerKey: 'center' | 'y' = 'center'
): number {
    if (!items.length) return -1
    const lastIndex = items.length - 1
    if (y <= centerOf(items[0]!, centerKey)) return 0
    if (y >= centerOf(items[lastIndex]!, centerKey)) return lastIndex

    let low = 0
    let high = lastIndex
    while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2)
        if (centerOf(items[middle]!, centerKey) <= y) low = middle
        else high = middle
    }

    return y - centerOf(items[low]!, centerKey) <= centerOf(items[high]!, centerKey) - y
        ? low
        : high
}

export function indexRangeAround(
    items: Indexable[],
    y: number,
    radius: number,
    centerKey: 'center' | 'y' = 'center'
): [number, number] {
    if (!items.length) return [0, -1]
    const minimum = y - radius
    const maximum = y + radius

    let low = 0
    let high = items.length
    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (centerOf(items[middle]!, centerKey) < minimum) low = middle + 1
        else high = middle
    }
    const start = low

    low = start
    high = items.length
    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (centerOf(items[middle]!, centerKey) <= maximum) low = middle + 1
        else high = middle
    }

    return start < low ? [start, low - 1] : [0, -1]
}
