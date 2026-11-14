# KAAS design system — "passbook"

- **Palette:** cream paper (`--bg`), ink text, the wallet logo's deep green (`--brand`), one marigold accent (`--gold`) for warnings and the hero rule, terracotta (`--neg`) only for over-budget and destructive actions. Light and dark themes in `src/index.css`.
- **Type:** IBM Plex Sans for text, IBM Plex Mono (tabular) for every amount so columns align. Bundled via `@fontsource`, so it works offline.
- **Layout:** one raised surface per screen (the Home hero). Everything else is flat rows divided by hairlines. No cards inside cards.
- **Touch:** every control is at least 44px. Inputs are 16px to stop mobile zoom.
- **Motion:** short fades and rises; disabled under `prefers-reduced-motion`.
- **Superseded:** `DESIGN_SYSTEM.md`, `DESIGN_AUDIT.md`, `DESIGN_REFERENCES.md`, `REDESIGN_SUMMARY.md` describe the previous emerald/glass design and can be deleted.
