# Changelog

All notable changes to deepchat are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [1.21.0] - 2026-11-27

### Fixed

- Mobile drawer swipes now ignore the implicit pointer-capture transfer, and release settling drives the drawer and pushed page to the resolved target instead of flashing shut.
- The thinking title fade now appears only while the title is pinned and content is scrolling underneath it, instead of washing out the first lines in normal flow.
- The image viewer supports left/right browsing across visible conversation images, continuous pinch zoom, anchored tap zoom and one-finger panning while zoomed.
- Cropping defaults to free aspect in both entry paths, follows the finger through pointer-up, and keeps using the image selected in the viewer.

[1.21.0]: https://github.com/salt-fishes/deepchat/releases/tag/v1.21

## [1.20.0] - 2026-11-27

### Changed

- Completed enter/exit motion for message menus, text selection, citations, hover cards, thinking-effort menus, tooltips and drag upload feedback.
- Added velocity-aware mobile drawer settling, drag-to-dismiss bottom sheets, animated desktop sidebar collapse and sequential Settings page transitions.
- Unified interaction motion tokens, coalesced anchored-popup scroll measurements and strengthened reduced-motion handling.
- Aligned usage and share sheets with the supplied references: removed the close button and focus ring, restored yuan price formatting, and added the two-action share footer.
- Refined share cards with the reference quote placement and hyphenated excerpt date while retaining the independent deepchat brand.
- Added motion regression coverage for drawer velocity, sheet dismissal, exit presence and reduced-motion behavior.

### Fixed

- Rapid overlay reopen/cancel cycles can no longer unmount a newly opened surface or leave stale gestures active.
- Modal and bottom-sheet input/focus locks now remain in place until their exit animation finishes.
- Usage pricing values no longer wrap or clip in the narrow reference layout.

[1.20.0]: https://github.com/salt-fishes/deepchat/releases/tag/v1.20

## [1.19.0] - 2026-11-27

### Changed

- Aligned Settings dialogs, font controls, message menus, editing, usage and share surfaces with the supplied DeepSeek design references.
- Double-click message editing now prefills the bottom composer while keeping the original message visible.
- Usage and share-card bottom sheets now span the full mobile width and extend to the bottom edge, with safe-area padding inside the sheet.
- Redesigned the per-reply usage panel with a reference-style header, estimate badge, grouped rate card and context footer.
- Updated share, usage and text-selection icons to a consistent outline style.
- Restored distinct floating citation previews and full-card search-result sources.
- Refined the thinking-area fade so it remains localized, soft and gap-free while the title stays sticky.
- Reworked share-card rendering with a cleaner white layout, quote treatment and independent deepchat branding.

### Fixed

- Bottom-sheet actions remain reachable above the Android gesture area without lifting the sheet off the bottom edge.
- Thinking content no longer leaks through the gap above the sticky title.

[1.19.0]: https://github.com/salt-fishes/deepchat/releases/tag/v1.19

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
