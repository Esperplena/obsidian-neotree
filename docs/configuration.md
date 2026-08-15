---
title: Configuration
nav_order: 3
---

# Configuration

All settings live under **Settings → Neotree**, grouped into four collapsible cards.

## 小球与视觉 (Orb & visuals)

| Setting  | Type     | Default   | Description                                    |
| -------- | -------- | --------- | ---------------------------------------------- |
| 小球样式 | dropdown | `default` | Orb style; includes `每日随机` (daily random). |

## 音效反馈 (Sound feedback)

| Setting  | Type     | Default | Description                                                                                                  |
| -------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| 拖动音效 | toggle   | off     | Tick sound while dragging past tick marks.                                                                   |
| 音效风格 | dropdown | `soft`  | Soft tick, music-box scale, wooden, mechanical, raindrop, 8-bit, watch gear, bubble, or match the orb style. |
| 音高滑动 | toggle   | off     | Pitch rises as you drag down the tree.                                                                       |
| 落定音效 | toggle   | off     | Confirmation sound when releasing.                                                                           |

## 活动与磁吸 (Activity & magnets)

| Setting    | Type   | Default | Description                                        |
| ---------- | ------ | ------- | -------------------------------------------------- |
| 今日轨迹   | toggle | on      | Faint dots marking files opened today.             |
| 智能磁吸点 | toggle | on      | The orb snaps to pinned and frequently used files. |

## 拖动与文件树 (Drag & file tree)

| Setting        | Type   | Default | Description                                          |
| -------------- | ------ | ------- | ---------------------------------------------------- |
| 包含文件夹     | toggle | on      | Show folder rows on the rail.                        |
| 松开打开项目   | toggle | on      | Open the nearest file (or toggle folder) on release. |
| 自动展开文件夹 | toggle | on      | Auto-expand a folder the orb rests on.               |

## Advanced Configuration

All settings are stored in the plugin's `data.json` inside your vault — you can
edit that file directly if you ever need to, though the settings tab is the
supported way to change them.
