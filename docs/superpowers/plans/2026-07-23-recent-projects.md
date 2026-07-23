# Recent Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resilient, bounded recent-project list to the existing Windows app startup screen.

**Architecture:** `StartScreen.tsx` owns versioned localStorage parsing/writing helpers and the recent-project React state. Existing create/open flows and a new recent-open flow share the same successful-recording rule while keeping command errors sanitized.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, browser localStorage.

## Global Constraints

- Do not add dependencies, Tauri commands, capabilities, or native permissions.
- Store at most 8 valid entries under `super-novel.recent-projects.v1`.
- Storage read/write failures must never block the existing project lifecycle.
- Failed recent opens remain until the user explicitly removes them.

---

### Task 1: Persistent recent-project behavior

**Files:**
- Modify: `src/components/StartScreen.tsx`
- Test: `src/components/StartScreen.test.tsx`

**Interfaces:**
- Consumes: `NovelApi.openProject(directory)` and `WorkspaceDto.project.name`.
- Produces: `RecentProject`, `loadRecentProjects`, and successful create/open recording.

- [ ] **Step 1: Write failing tests**

Add tests which seed localStorage, open a recent path without invoking the picker, verify a successful duplicate moves to the front, verify only eight entries remain, and verify an invalid recent item stays visible until its remove button is clicked.

- [ ] **Step 2: Verify the tests fail**

Run `npm test -- --run src/components/StartScreen.test.tsx`.

Expected: recent-project buttons and persistence behavior are absent.

- [ ] **Step 3: Implement minimal persistence and UI**

Use a lazy state initializer around guarded JSON parsing. Record:

```ts
interface RecentProject {
  name: string;
  directory: string;
  lastOpenedAtMs: number;
}
```

On success, prepend the new record, remove path-equivalent older records, sort by `lastOpenedAtMs`, slice to 8, update React state, and attempt localStorage persistence inside `try/catch`. Render flat divided rows with explicit open/remove accessible names.

- [ ] **Step 4: Verify focused tests pass**

Run `npm test -- --run src/components/StartScreen.test.tsx`.

Expected: all StartScreen tests pass.

### Task 2: App integration and final verification

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: the existing `App` not-found startup transition.
- Produces: startup integration coverage and visual states matching the current design.

- [ ] **Step 1: Write the failing App integration test**

Seed one valid recent entry, make `getWorkspace` return `not_found`, render `App`, and assert the recent-project open control becomes visible.

- [ ] **Step 2: Verify the App test fails before UI implementation is complete**

Run `npm test -- --run src/App.test.tsx -t "recent"`.

Expected: the recent entry is not rendered.

- [ ] **Step 3: Add restrained startup-list styling**

Use existing warm-neutral tokens, 1px dividers, ellipsized paths, visible focus, disabled, hover and active states. Do not add cards, gradients, motion libraries, or new icons.

- [ ] **Step 4: Run full verification**

Run:

```text
npm test -- --run
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Stage only the recent-project files and commit with `feat: add recent project startup list`.
