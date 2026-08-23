# Flow & Step Spec (v0)

This is the JSON schema every part of the library reads and writes. Keep `src/types.ts`
in sync with this document — if they drift, this document wins and types.ts should be
corrected.

## Flow

```json
{
  "id": "onboarding-create-project",
  "title": "Create your first project",
  "version": 1,
  "steps": [ /* Step[] — see below */ ]
}
```

| field   | type     | required | notes                                      |
|---------|----------|----------|---------------------------------------------|
| id      | string   | yes      | unique, stable, used for analytics/lookups |
| title   | string   | yes      | human-readable name for this flow          |
| version | number   | yes      | bump manually when steps change meaningfully |
| steps   | Step[]   | yes      | ordered array, played in array order        |

## Step

```json
{
  "id": "step-1",
  "selectors": {
    "testId": "create-project-btn",
    "ariaLabel": "Create new project",
    "text": "Create Project",
    "cssPath": "div.sidebar > button:nth-child(2)"
  },
  "title": "Create a project",
  "text": "Click here to create your first project.",
  "placement": "bottom",
  "advanceOn": "click",
  "route": "/settings"
}
```

| field      | type   | required | notes                                                   |
|------------|--------|----------|----------------------------------------------------------|
| id         | string | yes      | unique within the flow                                   |
| selectors  | object | yes      | at least one of the four sub-fields must be present       |
| title      | string | no       | short heading shown in the tooltip                        |
| text       | string | yes      | the instruction shown to the user                         |
| placement  | enum   | no       | "top" \| "bottom" \| "left" \| "right" — default "bottom" |
| advanceOn  | enum   | no       | "click" (default) — later: "input", "manual" (Next button)|
| route      | string | no       | a path (e.g. `/settings`) or trailing-wildcard pattern (e.g. `/settings/*`) the step is expected to be on. Omitted means the step applies regardless of current location — fully backward compatible with flows written before this field existed. |

## Multi-page flows (route field)

A step's `route` is informational, not a gate on matching: the selector fallback chain
(below) still decides whether a step resolves. What `route` changes is *how* the player
looks for the step's target:

- If a step has no `route`, or its `route` is the same as the previous step's `route`,
  the player resolves it instantly (a single synchronous pass through the fallback
  chain), exactly as before this field existed.
- If a step's `route` differs from the previous step's `route`, the player assumes a
  navigation may have just happened (e.g. the user clicked a link to a new page) and
  polls the fallback chain on an interval (default 150ms) until it resolves or a timeout
  elapses (default 5000ms), both configurable via `TourPlayerOptions`. This gives a new
  page's DOM time to render before the step is given up on and marked unresolved.

Route *matching* against the current location (needed once automatic navigation
detection is added — not yet implemented) is exact-string, except a trailing `*` which
matches any suffix — e.g. `/settings/*` matches `/settings/profile` and
`/settings/billing`, but not `/settings` itself unless listed separately.

Progress through a multi-page flow is persisted after each successful step advance (see
the persistence module) so a fresh page load can resume where the user left off, instead
of re-running the whole flow from step one.

## Persistence, resuming, and `onFlowAbandoned`

Persisted state is exactly `{ flowId, stepIndex, flowVersion, timestamp }` in a single
namespaced `sessionStorage` key — never the full `Flow`, never selector or other PII
data. It's written after every successful step advance.

**Resuming is always an explicit decision made by the host app, never automatic.** On
page load, a host calls `player.getResumableState(flow)`, which returns
`{ flowId, stepIndex }` only if the persisted state matches the given flow's `id` and
`version` and hasn't expired (default 30 minutes, configurable) — a version bump or a
stale timestamp both mean "nothing to resume," never a silent resume against mismatched
state. The host then explicitly opts in via `player.start(flow, { resumeFromStep })`.
The player itself never reads persisted state on its own initiative.

`onFlowAbandoned({ flowId, stepIndex })` fires in exactly two cases, and no others:

1. `.stop()` is called while a step is active and the flow has not naturally completed
   (this covers an explicit host call, the Skip button, and the Escape key — all of
   which route through the same `.stop()` path). A flow that reaches its last step and
   completes normally does **not** count as abandoned, even though the player tears down
   the same UI either way.
2. `player.getResumableState(flow)` is called and finds a persisted state that has
   expired. This is the "discovered after the fact" case: the user never came back
   within the expiry window, so the abandonment is only knowable the next time someone
   checks. The stale state is cleared immediately after so it isn't reported twice.

`onFlowAbandoned` does **not** fire just because the page unloads mid-tour (there is no
`beforeunload` handling in this library at all) — for a multi-page flow, navigating away
mid-step is expected, not abandonment; state is persisted specifically so the tour can
continue on the next page. Whether that unload counts as abandonment is only decided
later, by case 2 above, if the user never returns before the state expires.

## Selector matching order (the fallback chain)

When the player looks for a step's target element, it tries selectors **in this exact
order** and stops at the first strategy that produces a match:

1. `selectors.testId` → matched against `[data-testid="<value>"]`, must match exactly
   one element
2. `selectors.ariaLabel` → matched against `[aria-label="<value>"]`, must match exactly
   one element
3. `selectors.text` → matched against elements whose trimmed visible text equals the
   value exactly, must match exactly one element
4. `selectors.cssPath` → matched via `document.querySelector`
5. Fuzzy text (last resort) → only attempted if `selectors.text` is set and steps 1-4 all
   failed. Scores every visible element's trimmed text against `selectors.text` using a
   Levenshtein-distance similarity ratio (0-1, case-insensitive) and takes the single
   best-scoring candidate — but only if its score clears a minimum similarity threshold
   **and** no other candidate ties it. A tie, or nothing clearing the threshold, is
   treated the same as no match: deterministic and explainable, never a guess between
   ambiguous candidates.

If none of the five strategies produce a match, the step is marked `unresolved`, the
step is skipped, and an `onStepUnresolved(step)` callback fires so the host app can
log/report it. The player must never throw an uncaught error or block the page when a
step can't be found, and must continue on to the next step rather than halting.

Each successfully resolved step records which of the five strategies won (see
`TourPlayer.getMatchLog()`), so a host app can later detect a flow that's "degrading" —
falling back to `cssPath`/`fuzzyText` more often than exact matches.

## Automatic navigation detection

While a tour is active, the player wraps `history.pushState`/`replaceState` (once per
page, regardless of how many `TourPlayer` instances exist) to also dispatch an internal
event, and listens for that plus `popstate` and `hashchange`. On any detected navigation,
if the currently active step's target element is no longer in the document, the player
re-attempts resolving that step with the poll-based resolver — covering SPA route
changes that swap the DOM without a full page load. Apps that don't want history patched,
or whose router doesn't fire these events, can call `player.notifyNavigation()` manually
to trigger the same check.

## Explicitly out of scope for v0

- Fuzzy/ML-based **visual** matching (pixel/screenshot comparison, layout heuristics) —
  the fuzzy *text* fallback above is a ranked, deterministic string-similarity
  comparison, not visual/ML guessing, and stays in scope.
- Any field for video or screenshots.
- Any field requiring an API key or remote service to resolve a step.
