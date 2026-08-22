# Optional: AI-suggested step copy

`src/ai-copy.ts` exports one function, `suggestStepCopy`, that asks the Anthropic API
to suggest a `title` and `text` for a captured [`Step`](../docs/SPEC.md). It exists so
you can skip hand-writing tooltip copy after recording a flow with `TourRecorder`
(see [Step 3](../docs/ROADMAP.md)) — nothing more.

**This is entirely optional.**

- tour-lib works perfectly with zero AI usage. `TourPlayer` and `TourRecorder` never
  call `suggestStepCopy`, import it, or know it exists.
- It requires **your own Anthropic API key** — tour-lib doesn't provide one, doesn't
  proxy the request, and doesn't store or transmit your key anywhere except directly
  to `api.anthropic.com`.
- It's published as a separate entry point (`tour-lib/ai-copy`), so importing the core
  library never pulls this file, or a `fetch` call, into your bundle.
- It makes a real network request that costs money on your Anthropic account. Call it
  yourself, per step, only when you want it.

⚠️ **Security note:** this function sends your API key wherever it runs. If you call it
from client-side browser code, that key is visible to anyone inspecting network
requests on the page. Prefer running it from a local/build-time script over a captured
flow file, rather than shipping the key inside a production web app.

## Usage

```ts
// Published package:
import { TourRecorder } from "tour-lib";
import { suggestStepCopy } from "tour-lib/ai-copy";

// In this repo during development, that's instead:
// import { TourRecorder } from "../dist/esm/index.js";
// import { suggestStepCopy } from "../dist/esm/ai-copy.js";

const recorder = new TourRecorder();
recorder.start();
// ...user clicks through the page to record steps...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");

const apiKey = process.env.ANTHROPIC_API_KEY!; // your own key, your own account

for (const step of flow.steps) {
  // Re-find the element you just captured to build a bit of context for the model.
  const target = step.selectors.cssPath ? document.querySelector(step.selectors.cssPath) : null;
  if (!target) continue;

  try {
    const suggestion = await suggestStepCopy(step, apiKey, {
      tag: target.tagName.toLowerCase(),
      role: target.getAttribute("role") ?? undefined,
      nearbyText: target.parentElement?.textContent?.trim().slice(0, 120),
    });
    step.title = suggestion.title;
    step.text = suggestion.text;
  } catch (err) {
    // suggestStepCopy always throws a clear Error rather than failing silently —
    // fall back to the placeholder copy TourRecorder already generated.
    console.warn(`Could not get AI copy for ${step.id}:`, err);
  }
}

// flow.steps now have AI-suggested title/text where the request succeeded.
// Save flow to a JSON file, or pass it straight to TourPlayer.start(flow).
```
