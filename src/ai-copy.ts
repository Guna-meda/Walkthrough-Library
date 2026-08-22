import type { Step } from "./types.js";

/** Cheap, minimal DOM context about the captured element, used to ground the
 * suggestion — callers typically read this straight off the live element right
 * after capture (tagName, role attribute, and a bit of surrounding page text). */
export interface ElementContext {
  tag: string;
  role?: string;
  nearbyText?: string;
}

export interface StepCopySuggestion {
  title: string;
  text: string;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;

/**
 * Optional, opt-in helper: asks the Anthropic API to suggest a short `title` and
 * one-sentence `text` for a captured Step, using the caller's own API key.
 *
 * This is never called automatically by capture.ts or player.ts, and the core
 * library works perfectly with zero AI usage — call this yourself, per step, only
 * if you'd rather have AI-suggested copy than write it by hand.
 *
 * Security note: this sends `apiKey` directly to api.anthropic.com from wherever
 * this function runs. If you call it from client-side browser code, that key is
 * visible to anyone inspecting network requests — prefer running this from a
 * build-time/authoring script (e.g. a local Node CLI over a captured flow file)
 * rather than shipping it inside a production web page.
 */
export async function suggestStepCopy(
  step: Step,
  apiKey: string,
  elementContext: ElementContext
): Promise<StepCopySuggestion> {
  if (!apiKey) {
    throw new Error("suggestStepCopy: an Anthropic API key is required.");
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // Required for the Messages API to accept a request made directly from a
        // browser page rather than a server. Harmless (ignored) elsewhere.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: buildPrompt(step, elementContext) }],
      }),
    });
  } catch (err) {
    throw new Error(`suggestStepCopy: request to the Anthropic API failed: ${errorMessage(err)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `suggestStepCopy: Anthropic API returned ${response.status} ${response.statusText}${
        body ? ` — ${body}` : ""
      }`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new Error(`suggestStepCopy: could not parse the Anthropic API response as JSON: ${errorMessage(err)}`);
  }

  const rawText = extractResponseText(payload);
  if (!rawText) {
    throw new Error("suggestStepCopy: Anthropic API response did not contain any text content.");
  }

  return parseSuggestion(rawText);
}

function buildPrompt(step: Step, elementContext: ElementContext): string {
  const selectorHints = [
    step.selectors.testId ? `data-testid="${step.selectors.testId}"` : null,
    step.selectors.ariaLabel ? `aria-label="${step.selectors.ariaLabel}"` : null,
    step.selectors.text ? `visible text "${step.selectors.text}"` : null,
    step.selectors.cssPath ? `CSS path "${step.selectors.cssPath}"` : null,
  ].filter((hint): hint is string => hint !== null);

  const lines = [
    "You are writing copy for one step of a guided in-app product walkthrough — a",
    "spotlight tooltip that points at a single UI element. Given the element details",
    "below, suggest copy for that tooltip:",
    '- "title": a short, friendly heading (a few words, no trailing punctuation)',
    '- "text": one clear, friendly sentence telling the user what to do',
    "",
    `Element tag: <${elementContext.tag}>`,
  ];
  if (elementContext.role) lines.push(`Element role: ${elementContext.role}`);
  if (elementContext.nearbyText) lines.push(`Nearby page text: ${elementContext.nearbyText}`);
  if (selectorHints.length > 0) lines.push(`Known selectors: ${selectorHints.join(", ")}`);
  if (step.text) lines.push(`Current placeholder instruction: ${step.text}`);
  lines.push(
    "",
    'Respond with ONLY a JSON object of the exact shape {"title": string, "text": string} —',
    "no markdown code fences, no extra commentary."
  );

  return lines.join("\n");
}

function extractResponseText(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "content" in payload &&
    Array.isArray((payload as { content: unknown }).content)
  ) {
    const block = (payload as { content: Array<{ type?: string; text?: string }> }).content.find(
      (b) => b && b.type === "text" && typeof b.text === "string"
    );
    if (block && typeof block.text === "string") return block.text;
  }
  return null;
}

function parseSuggestion(rawText: string): StepCopySuggestion {
  const cleaned = stripCodeFence(rawText.trim());

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `suggestStepCopy: could not parse the model's response as JSON (${errorMessage(err)}). Raw response: ${rawText}`
    );
  }

  const title = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).title : undefined;
  const text = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).text : undefined;

  if (typeof title !== "string" || typeof text !== "string") {
    throw new Error(
      `suggestStepCopy: the model's response was valid JSON but missing a string "title"/"text". Raw response: ${rawText}`
    );
  }

  return { title: title.trim(), text: text.trim() };
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
