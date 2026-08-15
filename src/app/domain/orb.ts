import { RANDOM_DAILY_ORB_STYLES } from './orb-assets'

export type DailyOrbStyle = (typeof RANDOM_DAILY_ORB_STYLES)[number]
export type OrbStyle = 'default' | 'randomDaily' | DailyOrbStyle
export type ResolvedOrbStyle = 'default' | DailyOrbStyle

export const SOUND_STYLE_VALUES = [
    'soft',
    'scale',
    'wooden',
    'mechanical',
    'raindrop',
    'retro8bit',
    'watchgear',
    'bubble',
    'matchOrb'
] as const
export type SoundStyle = (typeof SOUND_STYLE_VALUES)[number]

export const PLAYBACK_SOUND_STYLE_VALUES = [
    'soft',
    'scale',
    'raindrop',
    'retro8bit',
    'watchgear',
    'wooden',
    'mechanical',
    'bubble',
    'wood',
    'digital',
    'bounce',
    'thump',
    'pop',
    'chime',
    'spark',
    'bell'
] as const
export type PlaybackSoundStyle = (typeof PLAYBACK_SOUND_STYLE_VALUES)[number]

/**
 * 校验并归一化小球样式配置值，防止非法值进入系统。
 */
export function normalizeOrbStyle(value: unknown): OrbStyle {
    const allStyles: readonly string[] = ['default', 'randomDaily', ...RANDOM_DAILY_ORB_STYLES]
    return allStyles.includes(value as string) ? (value as OrbStyle) : 'default'
}

export function getLocalDateKey(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function hashString(value: string): number {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
}

export function resolveOrbStyle(value: unknown): ResolvedOrbStyle {
    const style = normalizeOrbStyle(value)
    if (style !== 'randomDaily') return style
    return RANDOM_DAILY_ORB_STYLES[hashString(getLocalDateKey()) % RANDOM_DAILY_ORB_STYLES.length]!
}

export function normalizeSoundStyle(value: unknown): SoundStyle {
    return (SOUND_STYLE_VALUES as readonly string[]).includes(value as string)
        ? (value as SoundStyle)
        : 'soft'
}

export function normalizePlaybackSoundStyle(value: unknown): PlaybackSoundStyle {
    return (PLAYBACK_SOUND_STYLE_VALUES as readonly string[]).includes(value as string)
        ? (value as PlaybackSoundStyle)
        : 'soft'
}

const CHARACTER_ORB_STYLES = new Set([
    'character1',
    'character2',
    'character3',
    'character4',
    'character5',
    'shutup',
    'snorlax',
    'pikachu',
    'snorlaxface',
    'clown',
    'fear',
    'devil',
    'fan',
    'alfresco',
    'mercedes',
    'taiga',
    'angry',
    'squint',
    'facemask',
    'pokerface',
    'captainshield',
    'batman',
    'superman',
    'spiderman'
])

export function soundStyleForOrb(orbStyle: string): PlaybackSoundStyle {
    switch (orbStyle) {
        case 'dragonball':
            return 'spark'
        case 'christmasball':
            return 'bell'
        case 'basketball':
            return 'thump'
        case 'soccer':
        case 'tennis':
            return 'bounce'
        case 'redball':
        case 'orangeball':
        case 'blueball':
            return 'pop'
        case 'pokeball':
            return 'spark'
        case 'bracelet':
            return 'chime'
        case 'gear':
            return 'digital'
        default:
            return CHARACTER_ORB_STYLES.has(orbStyle) ? 'bubble' : 'soft'
    }
}

export function resolveSoundStyle(value: unknown, orbStyle: string): PlaybackSoundStyle {
    const style = normalizeSoundStyle(value)
    return style === 'matchOrb' ? soundStyleForOrb(orbStyle) : style
}

/**
 * 不随滚动旋转的小球样式集合。
 * 当前为空 —— 所有样式都会滚动旋转；保留此集合以便将来按样式禁用旋转。
 */
export const STATIC_ORB_STYLES = new Set<string>()
