import { App, PluginSettingTab, Setting } from 'obsidian'
import { normalizeOrbStyle, normalizeSoundStyle, SOUND_STYLE_VALUES } from '../domain/orb'
import type { NeotreePlugin } from '../plugin'

const SOUND_STYLE_LABELS: Record<(typeof SOUND_STYLE_VALUES)[number], string> = {
    soft: 'Soft tick (经典轻型切音)',
    scale: 'Marimba Music Box Scale (八音盒音阶)',
    wooden: 'Crisp Muyu Wooden Block (清脆木鱼)',
    mechanical: 'Mechanical Blue Switch (机械青轴)',
    raindrop: 'Crystal Water Drop (清透水滴)',
    retro8bit: 'Retro 8-Bit Game (8-Bit 像素风)',
    watchgear: 'Vintage Watch Gear (名表发条)',
    bubble: 'Bubble Pop (轻柔气泡)',
    matchOrb: 'Match orb (跟随小球造型)'
}

export class CrispFileExplorerSettingTab extends PluginSettingTab {
    private plugin: NeotreePlugin

    constructor(app: App, plugin: NeotreePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    override display(): void {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl).setName('Crisp File Explorer').setHeading()

        const createGroup = (title: string, description: string, open = false): HTMLElement => {
            const details = containerEl.createEl('details', {
                cls: `crisp-fe-setting-card${open ? ' is-open' : ''}`
            })
            if (open) {
                details.open = true
            }
            const summary = details.createEl('summary', {
                cls: 'crisp-fe-setting-card__header'
            })

            const titleEl = summary.createDiv('crisp-fe-setting-card__title-group')
            titleEl.createDiv({ cls: 'crisp-fe-setting-card__title', text: title })
            if (description) {
                titleEl.createDiv({ cls: 'crisp-fe-setting-card__desc', text: description })
            }

            summary.createDiv({ cls: 'crisp-fe-setting-card__chevron' })

            const contentWrapper = details.createDiv('crisp-fe-setting-card__content-wrapper')
            const body = contentWrapper.createDiv('crisp-fe-setting-card__body')

            summary.addEventListener('click', (evt) => {
                evt.preventDefault()
                if (details.classList.contains('is-closing')) {
                    return
                }
                if (details.open) {
                    details.classList.remove('is-open')
                    details.classList.add('is-closing')
                    window.setTimeout(() => {
                        details.open = false
                        details.classList.remove('is-closing')
                    }, 240)
                } else {
                    details.open = true
                    window.requestAnimationFrame(() => {
                        details.classList.add('is-open')
                    })
                }
            })

            return body
        }

        // 1. Orb & Visual Appearance Group (Open by default)
        const orbBody = createGroup('小球与视觉', '选择人物、运动球、表情或齿轮等小球样式。', true)

        new Setting(orbBody)
            .setName('小球样式')
            .setDesc('选择可拖动小球的样式。')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('default', '默认')
                    .addOption('randomDaily', '每日随机')
                    .addOption('soccer', 'Soccer')
                    .addOption('basketball', 'Basketball')
                    .addOption('redball', 'Red ball')
                    .addOption('tennis', 'Tennis')
                    .addOption('clown', 'Clown')
                    .addOption('dragonball', 'Dragon Ball')
                    .addOption('christmasball', 'Christmas Ball')
                    .addOption('orangeball', 'Orange Ball')
                    .addOption('blueball', 'Blue Ball')
                    .addOption('character1', 'Character 1')
                    .addOption('character2', 'Character 2')
                    .addOption('character3', 'Character 3')
                    .addOption('character4', 'Character 4')
                    .addOption('character5', 'Character 5')
                    .addOption('shutup', 'Shut Up')
                    .addOption('snorlax', 'Snorlax')
                    .addOption('pikachu', 'Pikachu')
                    .addOption('pokeball', 'Poke Ball')
                    .addOption('bracelet', 'Bracelet')
                    .addOption('snorlaxface', 'Snorlax Face')
                    .addOption('fear', 'Fear')
                    .addOption('devil', 'Devil')
                    .addOption('fan', 'Ventilation fan')
                    .addOption('gear', 'Gear')
                    .addOption('alfresco', 'Alfresco')
                    .addOption('mercedes', 'Mercedes-Benz')
                    .addOption('taiga', 'Taiga')
                    .addOption('angry', 'Angry')
                    .addOption('squint', 'Squint')
                    .addOption('facemask', 'Face Mask')
                    .addOption('pokerface', 'Poker Face')
                    .addOption('captainshield', 'Captain America Shield')
                    .addOption('batman', 'Batman')
                    .addOption('superman', 'Superman')
                    .addOption('spiderman', 'Spider-Man')
                    .setValue(normalizeOrbStyle(this.plugin.settings.orbStyle))
                    .onChange(async (value) => {
                        const selectedStyle = normalizeOrbStyle(value)
                        this.plugin.settings.orbStyle = selectedStyle
                        await this.plugin.saveSettings()
                        this.plugin.updateOrbStyles()
                    })
            )

        // 2. Audio & Sound Feedback Group
        const audioBody = createGroup('音效反馈', '设置小球经过轨道刻度和落定时的声音。', false)

        new Setting(audioBody)
            .setName('拖动音效')
            .setDesc('小球经过文件树标记点时播放短促滴答声。')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.soundEnabled).onChange(async (value) => {
                    this.plugin.settings.soundEnabled = value
                    await this.plugin.saveSettings()
                })
            )

        new Setting(audioBody)
            .setName('音效风格')
            .setDesc('选择拖动与落定确认音效。')
            .addDropdown((dropdown) => {
                dropdown.setValue(normalizeSoundStyle(this.plugin.settings.soundStyle))
                for (const style of SOUND_STYLE_VALUES) {
                    dropdown.addOption(style, SOUND_STYLE_LABELS[style])
                }
                return dropdown.onChange(async (value) => {
                    this.plugin.settings.soundStyle = normalizeSoundStyle(value)
                    await this.plugin.saveSettings()
                })
            })

        new Setting(audioBody)
            .setName('音高滑动')
            .setDesc('沿文件树向下拖动时，音高随之升高。')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.pitchScaleEnabled).onChange(async (value) => {
                    this.plugin.settings.pitchScaleEnabled = value
                    await this.plugin.saveSettings()
                })
            )

        new Setting(audioBody)
            .setName('落定音效')
            .setDesc('小球落在某个项目上时播放确认音。')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.releaseSoundEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.releaseSoundEnabled = value
                        await this.plugin.saveSettings()
                    })
            )

        // 3. Activity & Heatmap Group
        const activityBody = createGroup(
            '活动与磁吸',
            '显示今日使用轨迹，并为固定或近期常用文件提供磁吸。',
            false
        )

        new Setting(activityBody)
            .setName('今日轨迹')
            .setDesc('在轨道上用淡点标记今日打开过的文件。')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.todayTrailEnabled).onChange(async (value) => {
                    this.plugin.settings.todayTrailEnabled = value
                    await this.plugin.saveSettings()
                    this.plugin.scheduleRefresh()
                })
            )

        new Setting(activityBody)
            .setName('智能磁吸点')
            .setDesc('固定文件优先，其余根据近期使用和打开频率提供轻柔磁吸。')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.frequentMagnetsEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.frequentMagnetsEnabled = value
                        await this.plugin.saveSettings()
                        this.plugin.scheduleRefresh()
                    })
            )

        // 4. Drag & File Tree Interaction Group
        const interactionBody = createGroup(
            '拖动与文件树',
            '设置轨道项目显示、松开行为和文件夹自动展开。',
            false
        )

        new Setting(interactionBody)
            .setName('包含文件夹')
            .setDesc('在动效轨道中同时显示文件夹行。')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.includeFolders).onChange(async (value) => {
                    this.plugin.settings.includeFolders = value
                    await this.plugin.saveSettings()
                    this.plugin.scheduleRefresh()
                })
            )

        new Setting(interactionBody)
            .setName('松开打开项目')
            .setDesc('松开小球时打开最近的文件，或展开/收起最近的文件夹。')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.openOnDragRelease).onChange(async (value) => {
                    this.plugin.settings.openOnDragRelease = value
                    await this.plugin.saveSettings()
                })
            )

        new Setting(interactionBody)
            .setName('自动展开文件夹')
            .setDesc('拖动时小球停留在文件夹上自动展开。')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoExpandFoldersOnDrag)
                    .onChange(async (value) => {
                        this.plugin.settings.autoExpandFoldersOnDrag = value
                        await this.plugin.saveSettings()
                    })
            )
    }
}
