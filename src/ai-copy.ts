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

/**
 * Optional, opt-in helper: builds a prompt asking for a short `title` and
 * one-sentence `text` for a captured Step, hands that prompt to the caller-supplied
 * `generate` function, and parses the returned text into a StepCopySuggestion.
 *
 * This has zero knowledge of which AI provider/model is used — `generate` is entirely
 * the caller's responsibility. It can call Anthropic, OpenAI, any other provider, a
 * local model, or a mocked function for testing. See examples/ai-copy-example.md for
 * sample `generate` implementations.
 *
 * This is never called automatically by capture.ts or player.ts, and the core library
 * works perfectly with zero AI usage — call this yourself, per step, only if you'd
 * rather have AI-suggested copy than write it by hand.
 */
export async function suggestStepCopy(
  step: Step,
  elementContext: ElementContext,
  generate: (prompt: string) => Promise<string>
): Promise<StepCopySuggestion> {
  const prompt = buildPrompt(step, elementContext);

  let rawText: string;
  try {
    rawText = await generate(prompt);
  } catch (err) {
    throw new Error(`suggestStepCopy: the generate function threw: ${errorMessage(err)}`);
  }

  if (!rawText) {
    throw new Error("suggestStepCopy: the generate function returned no text.");
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
