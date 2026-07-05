# Hero Meta Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard focus on adjacent-event hero heat movement, official hero identity, and tabbed hero detail analysis.

**Architecture:** Keep the current React single-page structure. Add small helper functions inside `src/App.tsx` for hero image URLs, event ordering, adjacent movement, and recent 3-month filtering, then wire those helpers into the existing panels.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library.

---

### Task 1: Lock New UI Behavior With Tests

**Files:**
- Modify: `tests/frontend/App.test.tsx`

- [ ] Add fixture data with at least three dated events and two metrics for the clicked hero.
- [ ] Add a test that the default rendered panel is heat movement, not hero ranking.
- [ ] Add a test that a hero button renders an official portrait URL derived from `npc_dota_hero_axe`.
- [ ] Add a test that clicking a hero opens tabs named `克制`, `配合`, and `近3个月热度`.
- [ ] Run `pnpm exec vitest --environment jsdom --run tests/frontend/App.test.tsx` and confirm the new tests fail for missing behavior.

### Task 2: Implement Hero Identity And Default Movement Focus

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Add `heroImageUrl(hero)` that maps `npc_dota_hero_axe` to an official Steam CDN portrait path.
- [ ] Make `HeroAvatarButton` render an `<img>` when the URL exists and fall back to initials only on image load failure.
- [ ] Change the initial active tab from `heroes` to `movement`.
- [ ] Emphasize adjacent-event movement copy and labels in the movement panel.
- [ ] Run the App test file and confirm the Task 1 identity/default-focus assertions pass.

### Task 3: Implement Tabbed Hero Detail Panel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Replace the current static relation groups with local detail tabs.
- [ ] Build counter and synergy lists from `heroPairRelations`, respecting current event and minimum-sample filters.
- [ ] Build recent heat rows by sorting events by `first_match`, filtering to the latest data date minus 3 months, and calculating delta from the previous event for the same hero.
- [ ] Run the App test file and confirm detail-tab assertions pass.

### Task 4: Full Verification

**Files:**
- No planned source edits.

- [ ] Run `pnpm exec tsc -b`.
- [ ] Run `pnpm exec vite build`.
- [ ] Run `pnpm exec vitest --environment jsdom --run`.
- [ ] Reload `http://127.0.0.1:5173/` in the in-app browser.
- [ ] Confirm the page title, default movement content, hero portrait, and detail tabs render without console errors.
