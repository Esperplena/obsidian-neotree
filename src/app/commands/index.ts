import type { NeotreePlugin } from '../plugin'

export function registerCommands(plugin: NeotreePlugin): void {
    plugin.addCommand({
        id: 'toggle-folder-marks',
        name: '切换文件夹刻度',
        callback: async () => {
            plugin.settings.includeFolders = !plugin.settings.includeFolders
            await plugin.saveSettings()
            plugin.scheduleRefresh()
        }
    })

    plugin.addCommand({
        id: 'toggle-tick-sound',
        name: '切换拖动音效',
        callback: async () => {
            plugin.settings.soundEnabled = !plugin.settings.soundEnabled
            await plugin.saveSettings()
        }
    })
}
