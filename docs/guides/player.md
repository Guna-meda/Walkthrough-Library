# TourPlayer

The core replay engine. `TourPlayer` resolves each step's target element, renders a
spotlight + tooltip, and waits for the real user to interact with the target before
advancing. Zero dependencies, no AI, no network calls.

```ts
import { TourPlayer } from "walkthrough-lib";

const player = new TourPlayer();
player.start(flow);
```

See [docs/SPEC.md](../SPEC.md) for the full `Flow`/`Step` schema this class reads.

## `start(flow: Flow, options?: TourPlayerOptions): void`

Stops any tour already in progress, then starts playing `flow` from the beginning (or
from `options.resumeFromStep`, see [multipage.md](multipage.md)).

### `TourPlayerOptions`

| option | type | default | fires / behaves |
|---|---|---|---|
| `onStepUnresolved` | `(step: Step) => void` | — | Called once per step whose target couldn't be resolved by any of the five matching strategies (see [resilience.md](resilience.md)). The step is skipped and the tour continues to the next one — a failed step never throws or halts playback. |
| `onStepChange` | `(step: Step \| null) => void` | — | Called with the newly-active `Step` whenever one renders, and with `null` when the tour becomes inactive (stopped, skipped to completion, or naturally finished). This is how the [React wrapper](react.md) mirrors "which step is active" into state without polling. |
| `onFlowAbandoned` | `(info: { flowId: string; stepIndex: number }) => void` | — | Fires in exactly two cases — see the **onFlowAbandoned semantics** section below. |
| `pollIntervalMs` | `number` | `150` | Interval between resolution attempts for a step whose `route` differs from the previous step's. See [multipage.md](multipage.md). |
| `pollTimeoutMs` | `number` | `5000` | How long to keep polling such a step before giving up and treating it as unresolved. |
| `resumeFromStep` | `number` | — | Step index to start at instead of `0`. Get this value from [`getResumableState()`](multipage.md#getresumablestate) — the player never resumes on its own. |

## `next(): void`

Advances to the next step, exactly as if the user had clicked the current step's
target. No-op if no tour is active.

## `stop(): void`

Tears down the current step's UI and ends the tour. Used internally by the tooltip's
Skip button and by the Escape key (see [accessibility.md](accessibility.md)) — both
route through this same method.

### `onFlowAbandoned` semantics

`onFlowAbandoned({ flowId, stepIndex })` fires in exactly two cases, and no others:

1. **`.stop()` is called while a step is active and the flow hasn't naturally
   completed.** This covers an explicit host call, the tooltip's Skip button, and the
   Escape key — all three route through `.stop()`. A flow that reaches its last step
   and completes normally does **not** count as abandoned, even though the same
   teardown code runs either way.
2. **`getResumableState()` finds a persisted state that has expired** — the
   "discovered after the fact" case, since a tour that's simply mid-navigation on a
   multi-page flow isn't abandoned yet. See [multipage.md](multipage.md).

`onFlowAbandoned` never fires just because the page unloads mid-tour — there is no
`beforeunload` handling anywhere in this library. For a multi-page flow, navigating
away mid-step is expected, not abandonment.

### There is no separate `onFlowComplete` callback

`TourPlayerOptions` has no `onFlowComplete` — completion is inferred from the
combination of the other two callbacks. When a flow reaches its last step and finishes
naturally, `onStepChange(null)` fires (the tour became inactive) **and**
`onFlowAbandoned` does **not** fire. An abandoned tour, by contrast, fires both:
`onStepChange(null)` followed by `onFlowAbandoned(...)`. If you need a single
"completed" signal, derive it yourself: track whether `onFlowAbandoned` fired since the
last `onStepChange(null)`.

## `getMatchLog(): MatchLogEntry[]`

Returns `{ stepId: string; strategy: MatchStrategy }[]` — which of the five matching
strategies (`"testId" | "ariaLabel" | "text" | "cssPath" | "fuzzyText"`) resolved each
step played so far, in play order. Use this to detect a flow that's silently degrading
toward its fragile fallbacks. See [resilience.md](resilience.md).

## `getResumableState(flow, options?)`

Checks whether a persisted tour can be resumed. See
[multipage.md](multipage.md#getresumablestate) for the full contract — it's
documented there rather than duplicated, since it's part of the multi-page resume flow.

## `notifyNavigation(): void`

Manually signals that a navigation may have happened, for apps that don't want
`history.pushState`/`replaceState` patched, or whose router doesn't fire
`popstate`/`hashchange`. See [multipage.md](multipage.md#navigation-detection).

## Manual test

`examples/demo.html` is a small fake dashboard with a hardcoded `Flow` — open it after
running `npm run build` to see `TourPlayer` end to end in a real browser, including the
`onStepUnresolved` callback wired to `console.warn`.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
