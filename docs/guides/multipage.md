# Multi-page flows

A flow can span more than one page. This is built on four pieces: the `route` field,
poll-based resolution, `sessionStorage` persistence, and automatic navigation
detection. Full field-level schema in [docs/SPEC.md](../SPEC.md).

## The `route` field

```json
{ "id": "step-2", "route": "/settings", "selectors": { "testId": "save-btn" }, "text": "..." }
```

`route` is a plain string on a `Step` — a path (`"/settings"`) or a trailing-wildcard
pattern (`"/settings/*"`). It's optional and omitting it means "applies regardless of
current location," which keeps it fully backward compatible with flows written before
this field existed.

`route` is informational, not a gate on matching — the selector fallback chain (see
[resilience.md](resilience.md)) still decides whether a step resolves. What `route`
actually changes is **how** the player looks for the target:

- If a step has no `route`, or its `route` is the same as the previous step's, the
  player resolves it instantly — a single synchronous pass through the fallback chain.
- If a step's `route` **differs** from the previous step's, the player assumes a
  navigation may just have happened and polls the fallback chain on an interval
  (`pollIntervalMs`, default 150ms) until it resolves or `pollTimeoutMs` (default
  5000ms) elapses — both configurable via `TourPlayerOptions` (see
  [player.md](player.md)). This gives a freshly-loaded page's DOM time to render before
  the step is given up on.

## Persistence

`src/persistence.ts` stores exactly `{ flowId, stepIndex, flowVersion, timestamp }` in
one namespaced `sessionStorage` key — never the full `Flow`, and never selector or
other PII data. It's written by `TourPlayer` after every successful step advance.

> **Note:** `persistence.ts` is built and emitted (`dist/esm/persistence.js`), and
> `examples/multipage-demo/page-b.html` imports `readState`/`writeState` from it
> directly for its "simulate expired state" control — but it is **not** listed in
> `package.json`'s `exports` map. If you install the published package, only `.`,
> `./ai-copy`, `./react`, and `./style.css` are importable; there's no supported
> `walkthrough-lib/persistence` entry point today.

Internally, the module exposes:

| function | signature | behavior |
|---|---|---|
| `writeState` | `(state: PersistedState) => void` | Best-effort; silently no-ops if `sessionStorage` is unavailable. |
| `readState` | `() => PersistedState \| null` | Returns `null` if nothing is stored or it's malformed. |
| `clearState` | `() => void` | Removes the stored state. |
| `readValidState` | `(flow, expiryMs?) => PersistedState \| null` | Like `readState`, but also checks `flowId`/`flowVersion` match and the state hasn't expired. |
| `isExpired` | `(state, expiryMs?) => boolean` | Default expiry is `DEFAULT_EXPIRY_MS` = 30 minutes. |

## Resuming (`getResumableState`)

**Resuming is always an explicit decision made by the host app, never automatic.** The
player itself never reads persisted state on its own initiative.

```ts
const resumable = player.getResumableState(flow, {
  expiryMs: 30 * 60 * 1000, // optional, defaults to 30 minutes
  onFlowAbandoned: (info) => console.warn("expired tour", info),
});

if (resumable) {
  player.start(flow, { resumeFromStep: resumable.stepIndex });
}
```

`getResumableState(flow, options?)` returns `{ flowId, stepIndex }` only if the
persisted state's `flowId` and `flowVersion` match the given `flow`'s `id`/`version`
**and** it hasn't expired — a version bump or a stale timestamp both mean "nothing to
resume," never a silent resume against mismatched state. If the persisted state exists
but has expired, this is exactly the "discovered after the fact" abandonment case (see
below): `options.onFlowAbandoned` fires (if provided) and the stale state is cleared
immediately so it isn't reported twice.

## `onFlowAbandoned` for multi-page flows

The full semantics live in [player.md](player.md#onflowabandoned-semantics); the
detail specific to multi-page flows is **why `beforeunload` isn't used**: navigating
away mid-step is the *expected* way a multi-page flow progresses (state is persisted
specifically so the tour can continue on the next page), so an unload by itself would
be a false positive for abandonment. Whether an unload turns out to have been
abandonment is only knowable later — the next time `getResumableState()` is called and
finds the persisted state has expired.

## Navigation detection

While a tour is active, `TourPlayer` patches `history.pushState`/`replaceState` once
per page (regardless of how many `TourPlayer` instances exist) to also dispatch an
internal event, and listens for that event plus `popstate` and `hashchange`. On any
detected navigation, if the currently active step's target element is no longer in the
document, the player re-attempts resolving that step with the poll-based resolver —
covering SPA route changes that swap the DOM without a full page load.

```ts
// For apps that don't want history patched, or whose router doesn't fire
// popstate/hashchange:
player.notifyNavigation();
```

`notifyNavigation()` triggers the exact same stale-target check manually.

## Manual test

`examples/multipage-demo/` has two real static pages (`page-a.html`, `page-b.html`)
linked by a real `<a href>`, sharing one `Flow` from `flow.js`:

1. `page-a.html`: click "Start Tour" — step 1 targets a link on that page.
2. Clicking the link is a real, full page navigation to `page-b.html`.
3. `page-b.html` calls `getResumableState()` on load and resumes automatically via
   `resumeFromStep` — no manual step-index passing.
4. A "Simulate 40-minutes-old persisted state" control ages the stored timestamp past
   the 30-minute default expiry, then re-checks `getResumableState()` — demonstrating
   that it correctly returns `null` and fires `onFlowAbandoned`.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
