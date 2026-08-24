# walkthrough-lib

A framework-agnostic library for guided in-app product walkthroughs — flows are
captured from real clicks instead of hand-written, no video, no AI required, and
steps survive minor UI changes via fallback selectors.

It shows a spotlight + tooltip on a real DOM element and waits for the *actual user*
to click it before advancing (not an auto-playing video, not a passive animation).

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

Full callback/method reference in [docs/guides/player.md](docs/guides/player.md).

## Quickstart: React

```tsx
import { useTour } from "walkthrough-lib/react";

function App() {
  const { start, isActive, currentStepId } = useTour();
  return <button onClick={() => start(flow)}>Start Tour</button>;
}
```

`walkthrough-lib/react` is a separate entry point — importing the core package never
pulls in React, and `react` is only a peer dependency, not a hard one. Full API and a
complete component in [docs/guides/react.md](docs/guides/react.md).

## Quickstart: capturing a flow instead of hand-writing it

`TourRecorder` listens for real clicks and builds `Step` JSON for you — each step gets
all four fallback selectors (`testId`, `ariaLabel`, `text`, `cssPath`) where available.
While recording, a small floating panel shows a step count and a "Finish & Export"
button that copies the resulting flow JSON to your clipboard.

```ts
import { TourRecorder } from "walkthrough-lib";

const recorder = new TourRecorder();
recorder.start(); // warns via console if not on localhost/127.0.0.1 or an allowedHosts entry
// ...user clicks through the app...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");
recorder.stop();
```

Pass `{ allowedHosts: ["staging.myapp.com"] }` to `start()` to silence that warning on
a legitimate non-local domain. Full workflow in
[docs/guides/capture.md](docs/guides/capture.md).

## Quickstart: AI-assisted copy (optional)

```ts
import { suggestStepCopy } from "walkthrough-lib/ai-copy";

const suggestion = await suggestStepCopy(
  step,
  { tag: "button", role: "button", nearbyText: "Create your first project" },
  generate // (prompt: string) => Promise<string> — you provide this, any provider
);
step.title = suggestion.title;
step.text = suggestion.text;
```

`generate` is entirely your own function — point it at Anthropic, OpenAI, a local
model, or a mock for testing; `walkthrough-lib` never makes the network call itself and
never requires an API key anywhere else in the library. Full signature and provider
examples in [docs/guides/ai-copy.md](docs/guides/ai-copy.md).

## Features

- **Multi-page support** — flows can span real page navigations or SPA route changes,
  with automatic resume. [Guide](docs/guides/multipage.md)
- **Self-healing selector fallback** — a five-strategy, deterministic matching chain so
  minor UI changes don't silently break a flow. [Guide](docs/guides/resilience.md)
- **Accessibility** — keyboard (Escape, focus trap), `aria-live` announcements, and
  proper ARIA roles, built in by default. [Guide](docs/guides/accessibility.md)
- **Completion/abandonment tracking** — `onStepChange`/`onFlowAbandoned` callbacks so a
  host app can track how far users get. [Guide](docs/guides/player.md)

## Flow & Step schema

Flows are plain JSON — see [docs/SPEC.md](docs/SPEC.md) for the full `Flow`/`Step`
schema, the selector fallback chain, and what's explicitly out of scope for v0.

## License

MIT — see [LICENSE](LICENSE).
