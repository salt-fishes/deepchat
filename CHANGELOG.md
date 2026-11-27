# Changelog

All notable changes to deepchat are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [1.18.0] - 2026-11-27

### Added

- In-app source previews and link viewer, with an explicit option to open the default browser.
- Android share targets, desktop long-press shortcuts, foreground background-generation service and generation notifications.
- Modern Android photo picker, native camera flow, unified image workbench and pinch-to-crop interaction.
- Message long-press menus, double-click editing, text-selection toolbar and haptic feedback.
- Per-reply usage details, estimated API cost and share-card generation with save/share actions.
- Share-card, pricing, settings, image-workbench and scroll-policy regression tests.
- Standardized release version checks and release artifact packaging.

### Changed

- Rebuilt Settings with whole-row language/appearance selectors, five-step chat font sizing, system font following and a redesigned usage dashboard.
- Thinking/search titles now remain visible while scrolling the thinking timeline, with smooth expand/collapse motion and a localized soft fade.
- Automatic scrolling now handles generation, restoration, keyboard and viewport changes while stopping when the reader scrolls upward.
- Markdown, math and Mermaid rendering received scheduling and long-conversation performance improvements.
- Android system haptics and font-scale preferences are integrated with the web interface.
- The chat composer no longer shows a blue focus outline.
- CI now runs the complete test suite before deploying the web app.

### Fixed

- Citation and browsing links now follow the in-app navigation rules.
- Camera and gallery flows keep temporary files and image metadata consistent.
- Background generation starts the foreground service while the app is visible, avoiding Android background-start restrictions.
- Missing usage figures remain explicitly unrecorded instead of showing fabricated averages.
- Release versions and artifact names are consistent across package metadata, Android and GitHub Releases.

### Security and privacy

- API keys remain on the device and are excluded from backups and share cards.
- Share cards use the independent `deepchat` brand and do not present themselves as an official DeepSeek client.

[1.18.0]: https://github.com/salt-fishes/deepchat/releases/tag/v1.18
