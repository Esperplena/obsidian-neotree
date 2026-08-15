---
title: Tips & best practices
nav_order: 90
---

# Tips and Best Practices

## Common Use Cases

- **Open a file fast** — drag the orb near the file and release. The orb's spring
  motion snaps smoothly between rows.
- **Keep important notes close** — right-click a file → **Pin to Crisp Rail**. Pinned
  files become permanent magnets and always sit at the top of the magnet list.
- **Glide over a large tree** — hold near the top/bottom edge while dragging to
  auto-scroll, and let folders auto-expand under the orb.

## Troubleshooting

### The rail does not appear

- Make sure the file explorer is visible and the plugin is enabled.
- On mobile, the rail is intentionally hidden (`is-mobile`).
- Check that `styles.css` was installed (manual installs need all three files).

### Sounds don't play

- Enable **拖动音效** / **落定音效** in settings.
- The first drag may require a user gesture to unlock audio on some systems.
- If **prefers-reduced-motion** is on, sound is suppressed by design.

### The orb shows the default style

- The selected style may have failed to load (e.g. a bundled image error); the orb
  falls back to the default. Try another style or reload Obsidian.
