# Roadmap

Rule: only the step marked **ACTIVE** should be worked on. Everything below it is
**NOT STARTED — do not build yet**, even if it seems like a natural next line of code.
If a task in the active step seems to require something from a later step, stop and
flag it instead of building it early.

## Step 1 — Core types + player engine — DONE
- `src/types.ts`: Flow and Step types matching docs/SPEC.md exactly.
- `src/player.ts`: `TourPlayer` class — resolves a step's element via the selector
  fallback chain, renders overlay + spotlight + tooltip, waits for a real click on the
  target to advance, exposes `.start(flow)`, `.next()`, `.stop()`.
- `examples/demo.html`: a small fake product page + a hardcoded Flow JSON, used to
  manually verify the player works end to end in a real browser.
- No CSS polish required yet beyond "functional and legible."
- No dependencies. No AI. No capture. No React.

## Step 2 — Visual polish — DONE
Default CSS theme (overlay dimming, tooltip styling, transitions), themeable via CSS
custom properties. Still zero dependencies, still no AI/capture.

## Step 3 — DOM capture tool — DONE
A `src/capture.ts` module that listens to real click/input events on a page and outputs
Step JSON (all four selector types) for each interaction. No AI involved — pure event
listening and DOM introspection.

## Step 4 — Self-healing matcher upgrade — DONE
Add fuzzy text matching as a last-resort fallback, and an `onStepUnresolved` reporting
hook that a host app can use to flag broken steps for re-capture.

## Step 5 — Optional AI copy layer — DONE
Bring-your-own-API-key helper that suggests `title`/`text` copy for a captured step.
Must be fully optional; the library works with zero AI usage.

## Step 6 — React wrapper — DONE
Thin `src/react/useTour.ts` hook wrapping the core player. Separate package, core has
zero React dependency.

## Step 7 — Publish & launch — ACTIVE
README with usage example + demo GIF, npm publish, GitHub repo with MIT license,
Show HN / Product Hunt post with a comparison vs Shepherd.js/Intro.js/driver.js.
README.md, LICENSE, and package.json repo metadata now exist; npm publish, the actual
GitHub repo, and an HN/PH post are unconfirmed, so this stays ACTIVE rather than DONE.

## Step 8 — (undocumented)
## Step 9 — (undocumented)
No content for these two steps was ever provided in this working session — do not
assume what they cover. (An earlier audit ruled out one guess: there is no
`onFlowComplete`/`onFlowAbandoned` or `flow.schema.json` predating Step 10/11 below, so
Step 9 isn't "the lifecycle hooks already existed.")

## Step 10 — Accessibility — DONE
`src/player.ts`: Escape stops the tour; Tab/Shift+Tab is trapped within the active
tooltip and focus is restored to whatever had it before, on both step-to-step
transitions and stop; a visually-hidden `aria-live="polite"` region announces each
step's title/text; the tooltip carries `role="dialog"` + `aria-modal="false"` (chosen
over `alertdialog` since it's informational and non-blocking) with
`aria-labelledby`/`aria-describedby`. Verified in a real browser: aria-live text,
focus movement/trap, and Escape teardown all confirmed via `examples/demo.html`.
README.md has an Accessibility section listing what's supported.

## Step 11a — Multi-page state: persistence, versioning, route matching, polling — DONE
- `src/types.ts` / `docs/SPEC.md`: optional `Step.route` field (exact path or trailing
  `/*` wildcard); omitted means "applies regardless of location," fully backward
  compatible.
- `src/persistence.ts`: internal module storing exactly
  `{ flowId, stepIndex, flowVersion, timestamp }` in one namespaced `sessionStorage`
  key — never the full Flow or selector/PII data. `writeState`/`readState`/`clearState`,
  plus `readValidState`/`isExpired` for version + expiry checks (default 30 min).
- `src/player.ts`: persists state after every successful step advance; a step whose
  `route` differs from the previous step's is resolved via a poll (default 150ms
  interval / 5000ms timeout, both configurable via `TourPlayerOptions`) instead of
  instantly, giving a freshly-navigated page's DOM time to render.
- `examples/multipage-demo/`: two real static pages (page-a.html, page-b.html) linked
  by a real `<a href>`. Verified in a real browser: persisted state read back on
  page-b correctly resolves and highlights the right element via the poll-based
  resolver.

## Step 11b — Multi-page navigation detection + resumable API + onFlowAbandoned rework — DONE
- `TourPlayer.getResumableState(flow, options)`: returns `{ flowId, stepIndex }` only
  if persisted state matches the given flow's id/version and hasn't expired; resuming
  is always an explicit host decision via `.start(flow, { resumeFromStep })` — the
  player never resumes on its own.
- Automatic SPA navigation detection: `history.pushState`/`replaceState` patched once
  per page to also dispatch an internal event; the player also listens for `popstate`
  and `hashchange`. On any detected navigation, if the currently active step's target
  has gone stale, it's re-resolved via the poll-based resolver from 11a. A manual
  `player.notifyNavigation()` covers apps that don't want history patched or whose
  router doesn't fire these events.
- `onFlowAbandoned({ flowId, stepIndex })`: fires only when (a) `.stop()` is called
  while a step is active and the flow hasn't naturally completed, or (b)
  `getResumableState()` finds a persisted state that has expired (discovered after the
  fact). It never fires on page unload — there is no `beforeunload` handling anywhere
  in this library. Full semantics documented in docs/SPEC.md. Note: since Step 9 was
  never actually built in this codebase (per the Step 8/9 gap above), this is
  `onFlowAbandoned`'s first real implementation, not a "rework" of prior behavior.
- `examples/multipage-demo/` updated: page-b now calls `getResumableState()` on load
  and resumes automatically via `resumeFromStep` — no manual stepIndex-passing. A
  "simulate 40-minutes-old state" control demonstrates the expiry path: aging the
  persisted timestamp past the 30-minute default correctly fires `onFlowAbandoned` and
  makes `getResumableState()` return `null`. Both verified in a real browser.
