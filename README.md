# walkthrough-lib

A framework-agnostic library for building guided in-app walkthroughs.

**Capture a walkthrough from your real UI, save it as JSON, and replay it with
resilient target matching** — instead of hand-writing every step and hoping the
selectors never break.

It shows a spotlight + tooltip on a real DOM element and waits for the *actual user*
to click it before advancing (not an auto-playing video, not a passive animation).

## How it works

```text
Your app → TourRecorder → Flow JSON → TourPlayer → Guided walkthrough
```

1. Capture a flow by clicking through your real UI.
2. Save the generated Flow JSON — plain, portable, versionable.
3. Play it anywhere with `TourPlayer` or `useTour`.
4. If the UI changes, the player walks its fallback selector chain to still find the
   target.

## At a glance

- **Capture flows** from real DOM clicks instead of hand-writing every step
- **Resilient targeting**: `testId → ariaLabel → text → cssPath → fuzzy text`
- **Framework agnostic** core player using plain DOM APIs
- **React support** through a separate `useTour` entry point
- **Multi-page flows** with route-aware target resolution and resume support
- **Accessible by default** — keyboard handling, focus management, `aria-live`
- **Zero runtime dependencies**
- **AI optional** — bring your own model/provider, never required

## Why not Shepherd.js / Intro.js / driver.js?

Those are solid, mature libraries. walkthrough-lib exists for three specific reasons
they don't cover:

1. **Flows can be captured, not just hand-written.** `TourRecorder` listens to real
   DOM clicks and generates valid `Step` JSON directly from your app — no manually
   writing selectors for every step.
2. **Steps survive minor UI changes.** Each step carries a ranked fallback chain
   instead of a single brittle selector, so a small refactor doesn't silently break
   your onboarding flow.
3. **Zero dependencies, zero required AI or network calls.** The core player and
   capture tool work 100% offline. AI is a separate, fully optional add-on you opt into
   per step — never a requirement to use the library.

## Install

```sh
npm install walkthrough-lib
```

This package ships a default stylesheet separately — you must import
`walkthrough-lib/style.css` yourself for the default look. Skipping this import is safe
(the player still functions) but renders unstyled: no overlay, no spotlight, no tooltip.

> **TypeScript note:** if that import reports "Cannot find module" in your editor or
> build, that's a missing CSS ambient-module type in *your* project, not a bug in this
> package — most bundler starter templates (Vite, CRA, etc.) already declare one for
> you. Fix it by adding `declare module "*.css";` to your own `vite-env.d.ts` (or
> equivalent ambient `.d.ts` file already included by your `tsconfig.json`).

## Package entry points

| Import | Purpose | Dependencies |
|---|---|---|
| `walkthrough-lib` | Core player, types, recorder | None |
| `walkthrough-lib/react` | `useTour` hook | React (peer, optional) |
| `walkthrough-lib/ai-copy` | Optional AI-assisted copy suggestions | None |
| `walkthrough-lib/style.css` | Default UI styling | None |

## Quickstart: write a flow by hand

You don't need the recorder to use this — a flow is just plain JSON, so you can write
one directly if you already know what you want to guide the user through:

```ts
import { TourPlayer } from "walkthrough-lib";
import "walkthrough-lib/style.css";

const flow = {
  id: "welcome",
  title: "Welcome tour",
  version: 1,
  steps: [
    { id: "step-1", selectors: { text: "Create Project" }, text: "Click here to get started." },
  ],
};

new TourPlayer().start(flow);
```

Full `Flow`/`Step` field reference in [docs/SPEC.md](docs/SPEC.md).

## Capture → Play

If you'd rather not hand-write every step, a captured flow is directly playable — `TourRecorder.exportFlow()` produces the same
`Flow` structure `TourPlayer.start()` consumes. No conversion step, no intermediate
format.

**1. Capture**
```ts
import { TourRecorder } from "walkthrough-lib";

const recorder = new TourRecorder();
recorder.start();

// ...user clicks through the app...

const flow = recorder.exportFlow("onboarding", "Onboarding Tour");
recorder.stop();
```

**2. Play**
```ts
import { TourPlayer } from "walkthrough-lib";
import "walkthrough-lib/style.css";

new TourPlayer().start(flow);
```

Full workflow, including the `allowedHosts` safety warning for accidental production
use, in [docs/guides/capture.md](docs/guides/capture.md).

## Quickstart: React

```tsx
import { useTour } from "walkthrough-lib/react";
import "walkthrough-lib/style.css";

function App() {
  const { start, isActive, currentStepId } = useTour();
  return <button onClick={() => start(flow)}>Start Tour</button>;
}
```

`useTour()` also returns `matchLog` (which selector strategy resolved each step) and
`lastEvent` (the most recent completion/abandonment/unresolved-step event), for
building a debug view or tracking analytics without wiring up `TourPlayer` callbacks
by hand.

`walkthrough-lib/react` is a separate entry point — importing the core package never
pulls in React, and `react` is only a peer dependency, not a hard one. Full API and a
complete component in [docs/guides/react.md](docs/guides/react.md).

## Selector fallback

Each step can carry multiple ways to locate its target:

```text
testId → ariaLabel → text → cssPath → fuzzy text → unresolved
```

The player stops at the first strategy that resolves to exactly one element. Fuzzy
text is a deterministic last resort only: ties or low-similarity matches are treated
as unresolved rather than guessed. Full chain details and `getMatchLog()` usage in
[docs/guides/resilience.md](docs/guides/resilience.md).

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

The library does not choose or call an AI provider for you. You supply `generate`, so
it can call Anthropic, OpenAI, a local model, another provider, or a mock for testing.
This is completely optional and is never required by the core player or recorder — no
API key, no network call, anywhere else in the library. Full signature and provider
examples in [docs/guides/ai-copy.md](docs/guides/ai-copy.md).

## Features

- **Multi-page support** — flows can span real page navigations or SPA route changes,
  with automatic resume. [Guide](docs/guides/multipage.md)
- **Self-healing selector fallback** — a five-strategy, deterministic matching chain so
  minor UI changes don't silently break a flow. [Guide](docs/guides/resilience.md)
- **Accessibility** — keyboard (Escape, focus trap), `aria-live` announcements, and
  proper ARIA roles, built in by default. [Guide](docs/guides/accessibility.md)
- **Lifecycle tracking** — `onFlowComplete`, `onFlowAbandoned`, `onStepUnresolved`, and
  `onStepChange` callbacks so a host app can track how far users get.
  [Guide](docs/guides/player.md)

## What it doesn't do

- No visual/screenshot-based element matching
- No ML-based DOM guessing
- No required backend or hosted service
- No required API key
- No video/screenshot recording

Target resolution is deterministic and DOM-based, always.

## Flow & Step schema

Flows are plain JSON — see [docs/SPEC.md](docs/SPEC.md) for the full `Flow`/`Step`
schema, the selector fallback chain, and what's explicitly out of scope for v0.

## License

MIT — see [LICENSE](LICENSE).