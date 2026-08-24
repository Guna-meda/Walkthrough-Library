# Selector resilience (the fallback chain)

Each `Step` can carry up to four selectors plus an automatic fuzzy-text last resort.
When `TourPlayer` looks for a step's target element, it tries them **in this exact
order** and stops at the first strategy that produces a match — deterministic, never a
visual/ML guess (see [docs/SPEC.md](../SPEC.md) and the "Deterministic over guessed"
principle in the project's own `CLAUDE.md`).

## The five strategies, in order

1. **`selectors.testId`** → `[data-testid="<value>"]`, must match exactly one element.
2. **`selectors.ariaLabel`** → `[aria-label="<value>"]`, must match exactly one element.
3. **`selectors.text`** → elements whose trimmed visible text equals the value exactly,
   must match exactly one element. If a wrapping container and its descendant both
   have the same trimmed text, only the innermost element counts as a candidate — so a
   wrapping `<div>` doesn't turn an otherwise-unique match into an ambiguous one.
4. **`selectors.cssPath`** → matched via `document.querySelector`. An invalid selector
   string falls through to unresolved rather than throwing.
5. **Fuzzy text (last resort)** → only attempted if `selectors.text` is set and
   strategies 1–4 all failed. Scores every visible element's trimmed text against
   `selectors.text` using a Levenshtein-distance similarity ratio (`0`–`1`,
   case-insensitive, computed via a self-contained implementation — no dependency) and
   takes the single best-scoring candidate, but only if:
   - its score clears the minimum similarity threshold (`0.6`), **and**
   - no other candidate ties it.

   A tie, or nothing clearing the threshold, is treated the same as no match:
   deterministic and explainable, never a guess between ambiguous candidates.

If none of the five strategies produce a match, the step is marked unresolved, skipped,
and `onStepUnresolved(step)` fires (see [player.md](player.md)) — `TourPlayer` never
throws or blocks the page over an unresolved step, and always continues to the next
one.

## `getMatchLog()`

```ts
const log = player.getMatchLog();
// [{ stepId: "step-1", strategy: "text" }, { stepId: "step-2", strategy: "fuzzyText" }, ...]
```

Every successfully-resolved step records which of the five strategies won, in play
order. A host app can use this to detect a flow that's silently **degrading** — falling
back to `cssPath`/`fuzzyText` more often than clean `testId`/`ariaLabel` matches — which
usually means the underlying UI has drifted from when the flow was captured, and it's
time to re-record it with [`TourRecorder`](capture.md).

## Manual test

`examples/resilience-demo.html` deliberately ships a flow with stale selectors to
exercise all five strategies at once:

| step | what's broken | resolves via |
|---|---|---|
| 1 | `testId`/`ariaLabel` | exact text match |
| 2 | `testId`/`ariaLabel`/`cssPath`, and the recorded text has a typo (`"Settngs"`) | fuzzy text match |
| 3 | everything, including unrelated text | stays unresolved, gets skipped |
| 4 | nothing (normal step) | proves the player recovers after a skip |

Click "Start Resilience Test", then "Show Match Log" to see `getMatchLog()`'s output
rendered live.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
