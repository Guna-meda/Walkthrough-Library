# React: `useTour()`

A thin React wrapper around the core `TourPlayer`, published as a separate entry
point so importing the core package never pulls React into your bundle.

```tsx
import { useTour } from "walkthrough-lib/react";
```

`react` is a peer dependency (`>=17.0.0`), marked optional in `package.json` — you must
have `react` installed yourself to use this entry point, but it's never required to use
the core `walkthrough-lib` package.

## `useTour(): UseTourResult`

```ts
interface UseTourResult {
  start: (flow: Flow) => void;
  next: () => void;
  stop: () => void;
  currentStepId: string | null;
  isActive: boolean;
  matchLog: MatchLogEntry[];
  lastEvent: TourEvent | null;
}

type TourEvent =
  | { type: "complete"; info: FlowCompleteInfo }
  | { type: "abandoned"; info: FlowAbandonedInfo }
  | { type: "unresolved"; step: Step };
```

| value | behavior |
|---|---|
| `start(flow)` | Starts `flow` on the hook's internal `TourPlayer` instance. |
| `next()` | Advances to the next step, same as `TourPlayer.next()`. |
| `stop()` | Stops the tour, same as `TourPlayer.stop()`. |
| `currentStepId` | The `id` of the currently-active `Step`, or `null` when no tour is active. Mirrors the player's `onStepChange` callback into React state. |
| `isActive` | Shorthand for `currentStepId !== null`. |
| `matchLog` | Which selector strategy resolved each step played so far, in play order. Mirrors `TourPlayer.getMatchLog()`, refreshed on every `onStepChange`. |
| `lastEvent` | The most recent `onFlowComplete` / `onFlowAbandoned` / `onStepUnresolved` callback from the player, as a single discriminated union — `null` until one of those three has fired at least once. Lets a component read one piece of state instead of wiring up its own callbacks for all three. |

## Reading `matchLog` and `lastEvent`

```tsx
import { useTour } from "walkthrough-lib/react";

function TourDebugPanel() {
  const { matchLog, lastEvent } = useTour();

  return (
    <div>
      <h4>Match log</h4>
      <ul>
        {matchLog.map((entry, i) => (
          <li key={i}>
            {entry.stepId} resolved via {entry.strategy}
          </li>
        ))}
      </ul>

      {lastEvent?.type === "complete" && <p>Flow "{lastEvent.info.flowId}" completed.</p>}
      {lastEvent?.type === "abandoned" && (
        <p>
          Flow "{lastEvent.info.flowId}" abandoned at step {lastEvent.info.stepIndex}.
        </p>
      )}
      {lastEvent?.type === "unresolved" && <p>Step "{lastEvent.step.id}" could not be resolved.</p>}
    </div>
  );
}
```

`matchLog` is handy for spotting a flow that's "degrading" — falling back to `cssPath`/
`fuzzyText` more often than exact matches (see [resilience.md](resilience.md)).
`lastEvent.type` lets you branch on completion vs. abandonment vs. an unresolved step
without deciding in advance which of the three you care about.

## Full working example

```tsx
import type { Flow } from "walkthrough-lib";
import { useTour } from "walkthrough-lib/react";
import "walkthrough-lib/style.css"; // Required for default spotlight/tooltip styling

const flow: Flow = {
  id: "onboarding-demo",
  title: "Demo onboarding flow",
  version: 1,
  steps: [
    {
      id: "step-1",
      selectors: { testId: "create-project-btn", ariaLabel: "Create new project" },
      title: "Create a project",
      text: "Click here to create your first project.",
      placement: "right",
    },
  ],
};

export default function App() {
  const { start, stop, currentStepId, isActive } = useTour();

  return (
    <div>
      <button data-testid="create-project-btn" aria-label="Create new project">
        + New Project
      </button>

      <div>{isActive ? `active step = "${currentStepId}"` : "not active"}</div>

      {isActive && <button onClick={stop}>Stop Tour</button>}
      <button onClick={() => start(flow)}>Start Tour</button>
    </div>
  );
}
```

This matches `examples/react-demo/src/App.tsx` in this repo, a runnable Vite +
React app you can start with `npm run dev` from that folder (after building the
library with `npm run build` in the repo root).

## What the hook does *not* expose

`useTour()` wraps `start`/`next`/`stop`/`currentStepId`/`isActive`/`matchLog`/
`lastEvent`. `lastEvent` covers `onFlowComplete`/`onFlowAbandoned`/`onStepUnresolved`
and `matchLog` covers `getMatchLog()`, but the hook still does not expose:

- `getResumableState()` or `notifyNavigation()` — the multi-page/resilience APIs
  described in [multipage.md](multipage.md) and [resilience.md](resilience.md).
- `pollIntervalMs`/`pollTimeoutMs`/`resumeFromStep` options on `start()` — only the
  `flow` argument is currently accepted.

If you need any of those, use `TourPlayer` directly rather than `useTour()` for now.

## StrictMode behavior

The player instance is created lazily via `useRef` (`if (playerRef.current === null)`
inside the component body), not via `useState`'s lazy initializer. React 18
StrictMode's double-invocation of a component's render function in development still
only creates one `TourPlayer`, because the ref persists across both invocations and the
null-check guards re-creation on the second one.

The cleanup effect that stops the tour on unmount does run through StrictMode's
mount → cleanup → mount cycle in development, which calls `.stop()` an extra time. This
is harmless: `TourPlayer.stop()` is a no-op when no tour is active, so it doesn't
trigger a spurious `onFlowAbandoned` or any visible effect.

## Cleanup on unmount

`useTour()` registers a `useEffect` cleanup (empty dependency array) that calls
`playerRef.current?.stop()` when the component unmounts — so navigating away from a
component using `useTour()` while a tour is active tears down the spotlight/tooltip UI
immediately, rather than leaking a tour that outlives its component. Since the hook now
wires up `onFlowAbandoned` internally, this `.stop()` call does update `lastEvent` to
an `{ type: "abandoned" }` event — but the component is already unmounting, so there's
no render left to read it from. If you need to observe an unmount-triggered abandonment
(e.g. to log it), use `TourPlayer` directly and pass `onFlowAbandoned` yourself (see
[player.md](player.md#onflowabandoned-semantics)).

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
