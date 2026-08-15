import type { OrbStyle, SoundStyle } from '../domain/orb'

export interface ActivityFileStat {
    count: number
    lastOpened: number
}

export interface ActivityData {
    todayKey: string
    todayPaths: string[]
    pinnedPaths: string[]
    fileStats: Record<string, ActivityFileStat>
}

export interface PluginSettings {
    /** 在动效轨道中同时显示文件夹行 */
    includeFolders: boolean
    /** 松开小球时打开最近的文件/文件夹 */
    openOnDragRelease: boolean
    /** 小球经过文件树标记点时播放短促滴答声 */
    soundEnabled: boolean
    /** 拖动与落定确认音效风格 */
    soundStyle: SoundStyle
    /** 沿文件树向下拖动时，音高随之升高 */
    pitchScaleEnabled: boolean
    /** 落定确认音效 */
    releaseSoundEnabled: boolean
    /** 小球样式 */
    orbStyle: OrbStyle
    /** 在轨道上用淡点标记今日打开过的文件 */
    todayTrailEnabled: boolean
    /** 固定文件优先，其余根据近期使用和打开频率提供轻柔磁吸 */
    frequentMagnetsEnabled: boolean
    /** 拖动时小球停留在文件夹上自动展开 */
    autoExpandFoldersOnDrag: boolean
    /** 活动记录（今日轨迹 / 固定 / 文件统计） */
    activity: ActivityData
}

export const DEFAULT_SETTINGS: PluginSettings = {
    includeFolders: true,
    openOnDragRelease: true,
    soundEnabled: false,
    soundStyle: 'soft',
    pitchScaleEnabled: false,
    releaseSoundEnabled: false,
    orbStyle: 'default',
    todayTrailEnabled: true,
    frequentMagnetsEnabled: true,
    autoExpandFoldersOnDrag: true,
    activity: {
        todayKey: '',
        todayPaths: [],
        pinnedPaths: [],
        fileStats: {}
    }
}
