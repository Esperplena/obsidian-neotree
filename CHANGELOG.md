# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are generated from conventional commits during the release
workflow — see `.github/workflows/release.yml`.


## [2.7.0](https://github.com/Esperplena/obsidian-neotree/releases/tag/2.7.0) (2026-08-16)

### Added

- Migrated the plugin to the standard `src/` build pipeline (TypeScript + Tailwind CSS).
- Renamed the plugin id to `neotree` and aligned names with community catalog rules.
- Rewrote the README and the `docs/` user guide.
- Performance: cached orb transforms, visibility checks, and item center reuse.

### Fixed

- Undefined `STATIC_ORB_STYLES` reference that could break non-default orb styles.
- Wrong `this.ticks.length` reference (now `this.tickEls.length`).
- Invalid `ignoreDeprecations` value in `tsconfig.json` for TypeScript 5.9.










