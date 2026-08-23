# walkthrough-lib

A framework-agnostic library for guided in-app product walkthroughs — flows are
captured from real clicks instead of hand-written, no video, no AI required, and
steps survive minor UI changes via fallback selectors.

It shows a spotlight + tooltip on a real DOM element and waits for the *actual user*
to click it before advancing (not an auto-playing video, not a passive animation).

## Install

```sh
npm install walkthrough-lib
```

## Quickstart: play a flow

```ts
import { TourPlayer } from "walkthrough-lib";
import "walkthrough-lib/style.css";

const flow = {
  id: "welcome", title: "Welcome tour", version: 1,
  steps: [{ id: "step-1", selectors: { text: "Create Project" }, text: "Click here to get started." }],
};

new TourPlayer().start(flow);
```

## Quickstart: capture a flow instead of hand-writing it

`TourRecorder` listens for real clicks and builds `Step` JSON for you — each step gets
all four fallback selectors (`testId`, `ariaLabel`, `text`, `cssPath`) where available.
While recording, a small floating panel shows a step count and a "Finish & Export"
button that copies the resulting flow JSON to your clipboard.

```ts
import { TourRecorder } from "walkthrough-lib";

const recorder = new TourRecorder();
recorder.start();
// ...user clicks through the app...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");
recorder.stop();
```

## Quickstart: React

```tsx
import { useTour } from "walkthrough-lib/react";

function App() {
  const { start, isActive, currentStepId } = useTour();
  return <button onClick={() => start(flow)}>Start Tour</button>;
}
```

`walkthrough-lib/react` is a separate entry point — importing the core package never
pulls in React, and `react` is only a peer dependency, not a hard one.

## Optional add-ons

- **AI-suggested copy** (`walkthrough-lib/ai-copy`) — an opt-in helper that asks the
  Anthropic API to suggest a `title`/`text` for a captured step, using your own API
  key. Never called automatically; see [examples/ai-copy-example.md](examples/ai-copy-example.md).

## Why not Shepherd.js / Intro.js / driver.js?

Those are solid, mature libraries. walkthrough-lib exists for three specific reasons
they don't cover:

1. **Flows can be captured, not just hand-written.** `TourRecorder` listens to real
   DOM clicks and generates valid `Step` JSON directly from your app — no manually
   writing selectors for every step.
2. **Steps survive minor UI changes.** Each step carries a ranked fallback chain
   (`testId` → `ariaLabel` → `text` → `cssPath` → fuzzy text as a deterministic last
   resort) instead of a single brittle selector, so a small refactor doesn't silently
   break your onboarding flow.
3. **Zero dependencies, zero required AI or network calls.** The core player and
   capture tool work 100% offline. AI is a separate, fully optional add-on you opt into
   per step — never a requirement to use the library.

## Flow & Step schema

Flows are plain JSON — see [docs/SPEC.md](docs/SPEC.md) for the full `Flow`/`Step`
schema, the selector fallback chain, and what's explicitly out of scope for v0.

## Accessibility

- **Keyboard**: Escape stops the tour at any point. Tab/Shift+Tab is trapped within the
  active tooltip's Skip/Next buttons while it's shown, and focus is restored to whatever
  had it before the tour (or before the current step's tooltip) took it.
- **Screen readers**: each step's title and text are announced automatically via a
  visually-hidden `aria-live="polite"` region — no need to tab to the tooltip to hear
  what changed. The tooltip itself uses `role="dialog"` with `aria-modal="false"` (it's
  informational and non-blocking — the spotlighted page element behind it stays
  interactive), and `aria-labelledby`/`aria-describedby` wired to its title/text.
- **Non-blocking by design**: the tooltip never traps interaction with the rest of the
  page — only Tab/Shift+Tab cycling within the tooltip itself is trapped, so assistive
  tech and the target element stay reachable.

## License

MIT — see [LICENSE](LICENSE).
