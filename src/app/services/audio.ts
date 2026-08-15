import { normalizePlaybackSoundStyle } from '../domain/orb'
import type { PlaybackSoundStyle } from '../domain/orb'

interface ToneOptions {
    type?: OscillatorType
    frequency: number
    frequencyEnd?: number
    duration?: number
    attack?: number
    release?: number
    volume?: number
}

const PENTATONIC_SCALE = [
    523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0
]

export class CrispAudio {
    private contexts = new WeakMap<Window, AudioContext>()
    private contextList = new Set<AudioContext>()
    private lastTickAt = 0
    private currentOwnerWindow: Window | null = null

    private ensureContext(ownerWindow: Window | null): AudioContext | null {
        const win = ownerWindow
        if (!win) return null
        const AudioContextCtor = (win as { AudioContext?: typeof AudioContext }).AudioContext
        if (!AudioContextCtor) return null
        let context = this.contexts.get(win)
        if (!context) {
            context = new AudioContextCtor()
            this.contexts.set(win, context)
            this.contextList.add(context)
        }
        if (context.state === 'suspended') {
            void context.resume().catch(() => {})
        }
        return context
    }

    async destroy(): Promise<void> {
        const contexts = Array.from(this.contextList)
        this.contextList.clear()
        this.contexts = new WeakMap()
        await Promise.all(
            contexts.map(async (context) => {
                if (context && context.state !== 'closed' && typeof context.close === 'function') {
                    await context.close()
                }
            })
        )
    }

    private playTone(options: ToneOptions): void {
        const context = this.ensureContext(this.currentOwnerWindow)
        if (!context) return

        const now = context.currentTime
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const duration = options.duration ?? 0.04
        const attack = options.attack ?? 0.004
        const release = options.release ?? 0.035
        const volume = options.volume ?? 0.025

        oscillator.type = options.type ?? 'triangle'
        oscillator.frequency.setValueAtTime(options.frequency, now)
        if (options.frequencyEnd) {
            oscillator.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + duration)
        }

        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(volume, now + attack)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release)

        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(now)
        oscillator.stop(now + duration + release + 0.01)
    }

    tick(
        style: PlaybackSoundStyle,
        progress = 0.5,
        pitchScale = false,
        ownerWindow: Window | null
    ): void {
        this.currentOwnerWindow = ownerWindow
        try {
            const now = performance.now()
            if (now - this.lastTickAt < 35) return
            this.lastTickAt = now

            let resolvedStyle = normalizePlaybackSoundStyle(style)
            if (resolvedStyle === 'wood') resolvedStyle = 'wooden'
            if (resolvedStyle === 'digital') resolvedStyle = 'mechanical'

            if (resolvedStyle === 'scale' || pitchScale) {
                const clampProgress = Math.max(0, Math.min(1, progress || 0))
                const index = Math.floor(clampProgress * (PENTATONIC_SCALE.length - 0.01))
                const freq = PENTATONIC_SCALE[index] ?? PENTATONIC_SCALE[0]!
                this.playTone({
                    type: 'sine',
                    frequency: freq,
                    duration: 0.038,
                    release: 0.032,
                    volume: 0.024
                })
            } else if (resolvedStyle === 'wooden') {
                this.playTone({
                    type: 'sine',
                    frequency: 720,
                    frequencyEnd: 360,
                    duration: 0.022,
                    release: 0.02,
                    volume: 0.03
                })
            } else if (resolvedStyle === 'mechanical') {
                this.playTone({
                    type: 'square',
                    frequency: 2600,
                    frequencyEnd: 1800,
                    duration: 0.01,
                    release: 0.012,
                    volume: 0.016
                })
            } else if (resolvedStyle === 'raindrop') {
                this.playTone({
                    type: 'sine',
                    frequency: 1850,
                    frequencyEnd: 620,
                    duration: 0.035,
                    release: 0.028,
                    volume: 0.026
                })
            } else if (resolvedStyle === 'retro8bit') {
                this.playTone({
                    type: 'square',
                    frequency: 987,
                    frequencyEnd: 1318,
                    duration: 0.02,
                    release: 0.018,
                    volume: 0.018
                })
            } else if (resolvedStyle === 'watchgear') {
                this.playTone({
                    type: 'triangle',
                    frequency: 3200,
                    frequencyEnd: 2400,
                    duration: 0.008,
                    release: 0.008,
                    volume: 0.022
                })
            } else if (resolvedStyle === 'bubble') {
                this.playTone({
                    type: 'sine',
                    frequency: 350,
                    frequencyEnd: 920,
                    duration: 0.045,
                    release: 0.035,
                    volume: 0.024
                })
            } else {
                this.playTone({
                    type: 'triangle',
                    frequency: 680,
                    duration: 0.012,
                    release: 0.012,
                    volume: 0.02
                })
            }
        } catch (error) {
            console.debug('Crisp File Explorer tick sound failed', error)
        } finally {
            this.currentOwnerWindow = null
        }
    }

    release(style: PlaybackSoundStyle, ownerWindow: Window | null): void {
        this.currentOwnerWindow = ownerWindow
        try {
            let resolvedStyle = normalizePlaybackSoundStyle(style)
            if (resolvedStyle === 'wood') resolvedStyle = 'wooden'
            if (resolvedStyle === 'digital') resolvedStyle = 'mechanical'

            if (resolvedStyle === 'scale') {
                this.playTone({
                    type: 'sine',
                    frequency: 659.25,
                    frequencyEnd: 1046.5,
                    duration: 0.08,
                    release: 0.06,
                    volume: 0.025
                })
            } else if (resolvedStyle === 'wooden') {
                this.playTone({
                    type: 'sine',
                    frequency: 540,
                    frequencyEnd: 260,
                    duration: 0.05,
                    release: 0.04,
                    volume: 0.032
                })
            } else if (resolvedStyle === 'mechanical') {
                this.playTone({
                    type: 'square',
                    frequency: 2200,
                    frequencyEnd: 950,
                    duration: 0.035,
                    release: 0.025,
                    volume: 0.018
                })
            } else if (resolvedStyle === 'raindrop') {
                this.playTone({
                    type: 'sine',
                    frequency: 850,
                    frequencyEnd: 1450,
                    duration: 0.065,
                    release: 0.05,
                    volume: 0.028
                })
            } else if (resolvedStyle === 'retro8bit') {
                this.playTone({
                    type: 'square',
                    frequency: 1318,
                    frequencyEnd: 1760,
                    duration: 0.06,
                    release: 0.04,
                    volume: 0.02
                })
            } else if (resolvedStyle === 'watchgear') {
                this.playTone({
                    type: 'triangle',
                    frequency: 2400,
                    frequencyEnd: 1200,
                    duration: 0.03,
                    release: 0.02,
                    volume: 0.024
                })
            } else if (resolvedStyle === 'bubble') {
                this.playTone({
                    type: 'sine',
                    frequency: 280,
                    frequencyEnd: 720,
                    duration: 0.08,
                    release: 0.05,
                    volume: 0.028
                })
            } else {
                this.playTone({
                    type: 'sine',
                    frequency: 320,
                    frequencyEnd: 180,
                    duration: 0.06,
                    release: 0.05,
                    volume: 0.026
                })
            }
        } catch (error) {
            console.debug('Crisp File Explorer release sound failed', error)
        } finally {
            this.currentOwnerWindow = null
        }
    }
}
