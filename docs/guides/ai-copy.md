# Optional: AI-suggested step copy

`walkthrough-lib/ai-copy` exports one function, `suggestStepCopy`, that builds a prompt
asking for a `title`/`text` for a captured [`Step`](../SPEC.md) and hands it to a
`generate` function **you supply**. It's a convenience for skipping hand-written
tooltip copy after recording a flow with [`TourRecorder`](capture.md) — nothing more.

**This is entirely optional, provider-agnostic, and never a requirement.**

- The core library works perfectly with zero AI usage. `TourPlayer` and `TourRecorder`
  never call, import, or know that `suggestStepCopy` exists.
- `suggestStepCopy` itself never makes a network call. It builds a prompt string and
  calls whatever `generate` function you pass, then parses the text that comes back.
  Point `generate` at Anthropic, OpenAI, a local model, or a mock for testing — same
  call site either way.
- It's published as a separate entry point (`walkthrough-lib/ai-copy`), so importing
  the core library never pulls this file, or any provider SDK/`fetch` call, into your
  bundle.
- Calling `generate` — API key, cost, network access — is entirely your
  responsibility. `walkthrough-lib` doesn't provide keys, doesn't proxy requests, and
  doesn't store or transmit anything on your behalf.

## Signature

```ts
function suggestStepCopy(
  step: Step,
  elementContext: ElementContext,
  generate: (prompt: string) => Promise<string>
): Promise<StepCopySuggestion>;

interface ElementContext {
  tag: string;
  role?: string;
  nearbyText?: string;
}

interface StepCopySuggestion {
  title: string;
  text: string;
}
```

`generate` can be any function matching `(prompt: string) => Promise<string>` — the
prompt asks the model to respond with only a JSON object of shape
`{"title": string, "text": string}` (no markdown fences, no commentary).
`suggestStepCopy` strips a code fence if the model added one anyway, then parses the
result. It **always throws a clear `Error`** rather than failing silently, in three
cases: `generate` itself threw, `generate` returned empty text, or the returned text
isn't valid JSON with string `title`/`text` fields — so callers should wrap it in a
`try`/`catch` and fall back to whatever placeholder copy they already have.

## Usage

```ts
import { TourRecorder } from "walkthrough-lib";
import { suggestStepCopy } from "walkthrough-lib/ai-copy";

const recorder = new TourRecorder();
recorder.start();
// ...user clicks through the page to record steps...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");

for (const step of flow.steps) {
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
      generate // <- any implementation matching (prompt: string) => Promise<string>
    );
    step.title = suggestion.title;
    step.text = suggestion.text;
  } catch (err) {
    console.warn(`Could not get AI copy for ${step.id}:`, err);
  }
}
```

## Example `generate` implementations

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

Both examples are also in [`examples/ai-copy-example.md`](../../examples/ai-copy-example.md),
alongside a mocked implementation for tests.

## Security note

If your `generate` implementation sends an API key from client-side browser code, that
key is visible to anyone inspecting network requests on the page. Prefer running
`suggestStepCopy` from a local/build-time script over a captured flow file, rather than
shipping a provider key inside a production web app.

## No network calls anywhere else in the library

Outside of `walkthrough-lib/ai-copy` — and only when you explicitly call
`suggestStepCopy` with your own `generate` function — nothing in `walkthrough-lib`
makes a network request or requires an API key. `TourPlayer`, `TourRecorder`, and the
React wrapper are pure DOM/TypeScript with zero runtime dependencies.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
