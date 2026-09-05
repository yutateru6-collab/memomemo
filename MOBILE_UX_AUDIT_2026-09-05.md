# MEMOMEMO Mobile UX Audit — 2026-09-05

GitHub Actions / Playwright mobile emulation (390×844, touch-enabled) findings before remediation:

- Editor header starts at y=0 with only 10px top padding; no explicit safe-area handling.
- Back button is 74×20px and too close to the top edge.
- No visible Save action or save-state feedback exists.
- Top editor controls measure only 26–28px for most actions.
- 16 visible buttons are below a 44px touch-target guideline in the audited editor view.
- New task text and datetime inputs render at 12px and can trigger iPhone input zoom.
- Task delete contains hover-only visibility (`opacity-0 group-hover:opacity-100`), unsuitable for touch-only use.
- Body has `user-select: none`, which is unfriendly for copying memo text.
- Memo textarea is now 16px, so the previously reported body-focus auto-zoom issue is addressed.
- No horizontal document overflow was measured at 390px, but the task row is overly compressed and primary actions are undersized.

Planned remediation:

1. Safe-area-aware editor header with 44px back/save/more targets.
2. Explicit Save action plus local-save/cloud-sync status feedback.
3. Back action flushes local persistence and attempts immediate cloud sync when configured.
4. Move secondary actions into a More menu; move Edit/Preview near memo content.
5. Stack task creation controls on phone widths.
6. Enforce 16px mobile form controls to prevent iPhone focus zoom.
7. Make touch-only delete controls accessible without hover.
8. Restore text selection for memo content and add keyboard/safe-area bottom room.
9. Re-run automated mobile UX measurements after implementation.
