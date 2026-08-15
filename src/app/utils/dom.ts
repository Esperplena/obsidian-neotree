/**
 * Popout-window-aware DOM helpers. Everything resolves against the window /
 * document that actually owns the element, so rails rendered in popout
 * windows animate and read from the correct document.
 */

export const prefersReducedMotion: { matches: boolean } =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false }

export function getOwnerDocument(element: Element): Document {
    return element.ownerDocument
}

export function getOwnerWindow(element: Element): Window {
    return element.ownerDocument.defaultView ?? window
}

export function isConnectedToOwnerDocument(element: HTMLElement): boolean {
    const ownerDocument = element.ownerDocument
    if (ownerDocument && ownerDocument.body && typeof ownerDocument.body.contains === 'function') {
        return ownerDocument.body.contains(element)
    }
    return element.isConnected !== false
}

export function requestOwnerFrame(element: Element, callback: FrameRequestCallback): number {
    return getOwnerWindow(element).requestAnimationFrame(callback)
}

export function cancelOwnerFrame(element: Element, frame: number | null): void {
    if (!frame) return
    getOwnerWindow(element).cancelAnimationFrame(frame)
}

export function setOwnerTimeout(element: Element, callback: () => void, delay: number): number {
    return getOwnerWindow(element).setTimeout(callback, delay)
}

export function clearOwnerTimeout(element: Element, timer: number | null): void {
    if (!timer) return
    getOwnerWindow(element).clearTimeout(timer)
}

/** Synthesize a mousedown/mouseup/click sequence on the element. */
export function dispatchMouseSequence(el: HTMLElement): void {
    const ownerWindow = getOwnerWindow(el)
    const MouseEventCtor = (ownerWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent
    const options: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: ownerWindow,
        button: 0
    }
    el.dispatchEvent(new MouseEventCtor('mousedown', options))
    el.dispatchEvent(new MouseEventCtor('mouseup', options))
    el.dispatchEvent(new MouseEventCtor('click', options))
}
