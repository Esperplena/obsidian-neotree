# Neotree

A crisp, tactile rail for the Obsidian file explorer. A small draggable orb glides
along the side of your file tree, snapping to tick marks and playing gentle sounds
as it passes files and folders — making browsing your vault feel fast and satisfying.

> Also known in-app as **Crisp File Explorer**.

## Features

- **Draggable orb** — grab the orb and glide it over your file tree. It springs
  smoothly between rows and tilts as it moves.
- **30+ orb styles** — sports balls, game characters, expressive faces, a gear,
  superheroes and more, plus a **daily random** mode that picks a new style each day.
- **Tick marks** — a rail with tick marks for every file and folder row. Ticks near
  the orb swell and bend toward it.
- **Sound feedback** — optional tick sounds while dragging (soft click, music-box
  scale, wooden block, mechanical switch, water drop, 8-bit, watch gear, bubble, or a
  style that follows the orb), pitch scaling as you move down the tree, and a
  confirmation sound when you release.
- **Today trail** — faint dots mark every file you opened today.
- **Smart magnets** — the orb gently snaps to pinned files and to files you open
  most often, so frequently used notes are always one glide away.
- **Pin files** — right-click any file → **Pin to Crisp Rail** to keep it as a
  permanent magnet (up to 8).
- **Auto-expand folders** — hold the orb over a collapsed folder to expand it.
- **Open on release** — drop the orb on a file to open it.
- **Respects reduced motion** — disables animations under
  `prefers-reduced-motion`.
- **Popout-window aware** — works in file explorer popout windows too.
- **Local & private** — everything runs in your vault; no network calls, no
  telemetry, no analytics.

## Install

### Community plugins

Once listed in the community catalog: **Settings → Community plugins → Browse →
Neotree → Install**.

### Manual / BRAT

Until the catalog listing is accepted, install from a [release](https://github.com/Esperplena/obsidian-neotree/releases):

1. Download `main.js`, `styles.css`, and `manifest.json` from the latest release.
2. Copy them into `<your-vault>/.obsidian/plugins/neotree/`.
3. Reload Obsidian and enable **Neotree** under **Settings → Community plugins**.

Requires Obsidian **1.8.7** or newer.

## Usage

The rail appears on the left edge of every file explorer pane. Drag the orb to
glide over rows; the nearest row is highlighted. Release to open the file (or
toggle a folder), optionally after auto-expanding it.

### Commands

| Command             | Palette entry             |
| ------------------- | ------------------------- |
| Toggle folder marks | `Neotree: 切换文件夹刻度` |
| Toggle tick sound   | `Neotree: 切换拖动音效`   |

### Settings

- **小球与视觉 (Orb & visuals)** — orb style, incl. daily random.
- **音效反馈 (Sound feedback)** — drag sound on/off, sound style, pitch scale,
  release sound.
- **活动与磁吸 (Activity & magnets)** — today trail and smart magnets.
- **拖动与文件树 (Drag & file tree)** — include folders, open on release, and
  auto-expand folders.

## Development

```bash
bun install        # install dependencies
bun run dev        # watch + build, copies to vault if OBSIDIAN_VAULT_LOCATION is set
bun run build      # production build (main.js, styles.css into dist/)
bun run tsc        # type-check (strict)
bun run lint       # ESLint (zero warnings enforced)
bun run format     # Prettier
bun test           # run tests
```

To auto-copy the build to your vault, set `OBSIDIAN_VAULT_LOCATION` to the vault
folder before running `bun run dev`.

The plugin id is `neotree` (set in `manifest.json`), so the vault folder is
`.obsidian/plugins/neotree/`.

## License

MIT — see [LICENSE](./LICENSE).

## Support

Found a bug or have a feature idea? [Open an issue](https://github.com/Esperplena/obsidian-neotree/issues).
