# Optional: AI-suggested step copy

`src/ai-copy.ts` exports one function, `suggestStepCopy`, that builds a prompt asking
for a `title` and `text` for a captured [`Step`](../docs/SPEC.md) and hands it to a
`generate` function **you supply**. It exists so you can skip hand-writing tooltip copy
after recording a flow with `TourRecorder` (see [Step 3](../docs/ROADMAP.md)) — nothing
more.

**This is entirely optional, and works with any provider.**

- walkthrough-lib works perfectly with zero AI usage. `TourPlayer` and `TourRecorder`
  never call `suggestStepCopy`, import it, or know it exists.
- `suggestStepCopy` has **zero knowledge of any specific AI provider**. It never makes a
  network call itself — it builds a prompt string and calls the `generate` function you
  pass in, then parses whatever text comes back. Point `generate` at Anthropic, OpenAI,
  any other provider, a locally-hosted model, or a mocked function for testing — it's
  all the same call site.
- It's published as a separate entry point (`walkthrough-lib/ai-copy`), so importing the
  core library never pulls this file, or any provider's SDK/fetch call, into your bundle.
- Whatever `generate` you use, calling it is your responsibility (API key, cost, network
  access) — walkthrough-lib doesn't provide keys, doesn't proxy requests, and doesn't
  store or transmit anything on your behalf.

⚠️ **Security note:** if your `generate` implementation sends an API key from
client-side browser code, that key is visible to anyone inspecting network requests on
the page. Prefer running `suggestStepCopy` from a local/build-time script over a
captured flow file, rather than shipping a provider key inside a production web app.

## Usage

```ts
// Published package:
import { TourRecorder } from "walkthrough-lib";
import { suggestStepCopy } from "walkthrough-lib/ai-copy";

// In this repo during development, that's instead:
// import { TourRecorder } from "../dist/esm/index.js";
// import { suggestStepCopy } from "../dist/esm/ai-copy.js";

const recorder = new TourRecorder();
recorder.start();
// ...user clicks through the page to record steps...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");

// Pick ONE `generate` implementation below (or write your own) and pass it in.

for (const step of flow.steps) {
  // Re-find the element you just captured to build a bit of context for the model.
  const target = step.selectors.cssPath ? document.querySelector(step.selectors.cssPath) : null;
  if (!target) continue;

  try {
    const suggestion = await suggestStepCopy(
      step,
      {
        tag: target.tagName.toLowerCase(),
        role: target.getAttribute("role") ?? undefined,
        nearbyText: target.parentElement?.textContent?.trim().slice(0, 120),
      },
      generate // <- any of the implementations below
    );
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

## Example `generate` implementations

Any function with the shape `(prompt: string) => Promise<string>` works. Here are two,
side by side — swap either one straight into the `suggestStepCopy` call above.

### Anthropic

```ts
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!; // your own key, your own account

async function generate(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content[0].text;
}
```

### OpenAI

```ts
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!; // your own key, your own account

async function generate(prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices[0].message.content;
}
```

### Mocked (for tests)

```ts
async function generate(prompt: string): Promise<string> {
  return JSON.stringify({ title: "Do the thing", text: "Click here to continue." });
}
```
