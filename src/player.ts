import type { Flow, Step, StepSelectors } from "./types.js";

export interface TourPlayerOptions {
  onStepUnresolved?: (step: Step) => void;
  /** Fires with the newly-active step whenever one renders, and with null when the
   * tour becomes inactive (stopped, skipped, or finished). Optional — the player
   * works the same with or without it; this only exists so a host UI (e.g. the React
   * wrapper) can mirror "which step is active" without polling. */
  onStepChange?: (step: Step | null) => void;
}

/** Which selector strategy resolved a step's target element (see docs/SPEC.md). */
export type MatchStrategy = "testId" | "ariaLabel" | "text" | "cssPath" | "fuzzyText";

export interface MatchLogEntry {
  stepId: string;
  strategy: MatchStrategy;
}

const SPOTLIGHT_CLASS = "tourlib-spotlight";
const TOOLTIP_CLASS = "tourlib-tooltip";
const VISIBLE_CLASS = "tourlib-visible";
const SPOTLIGHT_PADDING = 4;
const TOOLTIP_GAP = 12;
const VIEWPORT_MARGIN = 8;
// Mirrors the default --tour-transition-duration in style.css. If a consumer
// overrides that variable, the fade-out just finishes slightly early/late —
// harmless, since removal is also guarded by the transitionend listener.
const TRANSITION_FALLBACK_MS = 220;
// Minimum Levenshtein-ratio similarity (0-1) a candidate needs to win the fuzzy
// text fallback. Chosen to catch typos/minor rewording without guessing between
// genuinely different labels.
const FUZZY_TEXT_THRESHOLD = 0.6;

export class TourPlayer {
  private flow: Flow | null = null;
  private currentIndex = -1;
  private onStepUnresolved: ((step: Step) => void) | undefined;

  private spotlightEl: HTMLDivElement | null = null;
  private tooltipEl: HTMLDivElement | null = null;
  private currentTarget: Element | null = null;
  private currentClickHandler: ((ev: Event) => void) | null = null;
  private repositionHandler: (() => void) | null = null;
  private matchLog: MatchLogEntry[] = [];
  private onStepChange: ((step: Step | null) => void) | undefined;

  start(flow: Flow, options: TourPlayerOptions = {}): void {
    this.stop();
    this.flow = flow;
    this.onStepUnresolved = options.onStepUnresolved;
    this.onStepChange = options.onStepChange;
    this.currentIndex = -1;
    this.matchLog = [];
    this.advance(0);
  }

  next(): void {
    if (!this.flow) return;
    this.advance(this.currentIndex + 1);
  }

  stop(): void {
    const wasActive = this.flow !== null && this.currentIndex >= 0;
    this.teardownStepUI();
    this.flow = null;
    this.currentIndex = -1;
    this.onStepUnresolved = undefined;
    const onStepChange = this.onStepChange;
    this.onStepChange = undefined;
    if (wasActive) onStepChange?.(null);
  }

  /** Which selector strategy resolved each step played so far, in play order. */
  getMatchLog(): MatchLogEntry[] {
    return this.matchLog.slice();
  }

  /** Walks forward from startIndex, skipping any step whose target can't be resolved. */
  private advance(startIndex: number): void {
    if (!this.flow) return;
    let index = startIndex;
    while (index < this.flow.steps.length) {
      const step = this.flow.steps[index];
      const match = this.resolveTarget(step.selectors);
      if (match) {
        this.currentIndex = index;
        this.matchLog.push({ stepId: step.id, strategy: match.strategy });
        this.renderStep(step, match.element);
        this.onStepChange?.(step);
        return;
      }
      this.onStepUnresolved?.(step);
      index++;
    }
    this.stop();
  }

  private renderStep(step: Step, target: Element): void {
    this.teardownStepUI();
    this.currentTarget = target;

    target.scrollIntoView({ block: "center", inline: "center" });

    this.spotlightEl = document.createElement("div");
    this.spotlightEl.className = SPOTLIGHT_CLASS;
    document.body.appendChild(this.spotlightEl);

    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = TOOLTIP_CLASS;

    if (step.title) {
      const titleEl = document.createElement("div");
      titleEl.className = "tourlib-tooltip-title";
      titleEl.textContent = step.title;
      this.tooltipEl.appendChild(titleEl);
    }

    const textEl = document.createElement("div");
    textEl.className = "tourlib-tooltip-text";
    textEl.textContent = step.text;
    this.tooltipEl.appendChild(textEl);

    const actionsEl = document.createElement("div");
    actionsEl.className = "tourlib-tooltip-actions";

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "tourlib-btn tourlib-btn-skip";
    skipBtn.textContent = "Skip";
    skipBtn.addEventListener("click", () => this.stop());
    actionsEl.appendChild(skipBtn);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "tourlib-btn tourlib-btn-next";
    nextBtn.textContent = "Next";
    nextBtn.addEventListener("click", () => this.next());
    actionsEl.appendChild(nextBtn);

    this.tooltipEl.appendChild(actionsEl);
    document.body.appendChild(this.tooltipEl);

    this.positionUI(step);
    this.playEntranceTransition(this.spotlightEl, this.tooltipEl);

    this.repositionHandler = () => this.positionUI(step);
    window.addEventListener("scroll", this.repositionHandler, true);
    window.addEventListener("resize", this.repositionHandler);

    const advanceOn = step.advanceOn ?? "click";
    if (advanceOn === "click") {
      this.currentClickHandler = () => this.next();
      target.addEventListener("click", this.currentClickHandler, { once: true });
    }
  }

  /** Adds the visible class a frame after insertion so the CSS opacity/scale transition actually runs. */
  private playEntranceTransition(spotlightEl: HTMLElement, tooltipEl: HTMLElement): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        spotlightEl.classList.add(VISIBLE_CLASS);
        tooltipEl.classList.add(VISIBLE_CLASS);
      });
    });
  }

  private positionUI(step: Step): void {
    if (!this.currentTarget || !this.spotlightEl || !this.tooltipEl) return;

    const rect = this.currentTarget.getBoundingClientRect();

    Object.assign(this.spotlightEl.style, {
      top: `${rect.top - SPOTLIGHT_PADDING}px`,
      left: `${rect.left - SPOTLIGHT_PADDING}px`,
      width: `${rect.width + SPOTLIGHT_PADDING * 2}px`,
      height: `${rect.height + SPOTLIGHT_PADDING * 2}px`,
    });

    const placement = step.placement ?? "bottom";
    const tooltipRect = this.tooltipEl.getBoundingClientRect();

    let top = 0;
    let left = 0;
    switch (placement) {
      case "top":
        top = rect.top - tooltipRect.height - TOOLTIP_GAP;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.left - tooltipRect.width - TOOLTIP_GAP;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.right + TOOLTIP_GAP;
        break;
      case "bottom":
      default:
        top = rect.bottom + TOOLTIP_GAP;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        break;
    }

    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN));

    Object.assign(this.tooltipEl.style, { top: `${top}px`, left: `${left}px` });
  }

  private teardownStepUI(): void {
    if (this.currentTarget && this.currentClickHandler) {
      this.currentTarget.removeEventListener("click", this.currentClickHandler);
    }
    this.currentClickHandler = null;
    this.currentTarget = null;

    if (this.repositionHandler) {
      window.removeEventListener("scroll", this.repositionHandler, true);
      window.removeEventListener("resize", this.repositionHandler);
      this.repositionHandler = null;
    }

    this.fadeOutAndRemove(this.spotlightEl);
    this.spotlightEl = null;
    this.fadeOutAndRemove(this.tooltipEl);
    this.tooltipEl = null;
  }

  /** Lets the outgoing spotlight/tooltip fade out via CSS while the next step's UI fades in on top. */
  private fadeOutAndRemove(el: HTMLElement | null): void {
    if (!el) return;
    el.classList.remove(VISIBLE_CLASS);
    const remove = () => el.remove();
    el.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, TRANSITION_FALLBACK_MS);
  }

  /** Tries selectors.testId -> ariaLabel -> text -> cssPath -> fuzzy text, in that
   * order (see docs/SPEC.md). Fuzzy text is a last resort: it only runs once the four
   * exact strategies have all failed, and only ever returns a single, unambiguous
   * best-scoring candidate above FUZZY_TEXT_THRESHOLD — ties or no candidate clearing
   * the threshold both count as unresolved. */
  private resolveTarget(selectors: StepSelectors): { element: Element; strategy: MatchStrategy } | null {
    if (selectors.testId) {
      const el = matchUniqueBySelector(`[data-testid="${cssAttrEscape(selectors.testId)}"]`);
      if (el) return { element: el, strategy: "testId" };
    }
    if (selectors.ariaLabel) {
      const el = matchUniqueBySelector(`[aria-label="${cssAttrEscape(selectors.ariaLabel)}"]`);
      if (el) return { element: el, strategy: "ariaLabel" };
    }
    if (selectors.text) {
      const el = matchUniqueByText(selectors.text);
      if (el) return { element: el, strategy: "text" };
    }
    if (selectors.cssPath) {
      try {
        const el = document.querySelector(selectors.cssPath);
        if (el && !isTourUiElement(el)) return { element: el, strategy: "cssPath" };
      } catch {
        // invalid selector string — fall through to unresolved
      }
    }
    if (selectors.text) {
      const el = matchFuzzyByText(selectors.text);
      if (el) return { element: el, strategy: "fuzzyText" };
    }
    return null;
  }
}

/** True for the player's own spotlight/tooltip chrome, which is still in the DOM
 * mid-transition while the next step's target is being resolved and must never
 * itself be matched as a step target. */
function isTourUiElement(el: Element): boolean {
  return el.closest(`.${SPOTLIGHT_CLASS}, .${TOOLTIP_CLASS}`) !== null;
}

function matchUniqueBySelector(selector: string): Element | null {
  let matches: Element[];
  try {
    matches = Array.from(document.querySelectorAll(selector)).filter((el) => !isTourUiElement(el));
  } catch {
    return null;
  }
  return matches.length === 1 ? matches[0] : null;
}

function matchUniqueByText(text: string): Element | null {
  const all = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
  const matches = all.filter(
    (el) =>
      el.textContent !== null && el.textContent.trim() === text && isVisible(el) && !isTourUiElement(el)
  );
  // Prefer the innermost matching element(s) so a wrapping container with the
  // same trimmed text doesn't turn a unique match into an ambiguous one.
  const innermost = matches.filter(
    (el) => !matches.some((other) => other !== el && el.contains(other))
  );
  return innermost.length === 1 ? innermost[0] : null;
}

/** Finds the single best-scoring element for a fuzzy text match, or null if no
 * candidate clears FUZZY_TEXT_THRESHOLD or the top score is tied between candidates. */
function matchFuzzyByText(text: string): Element | null {
  const all = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
  const candidates = all.filter(
    (el) => el.textContent !== null && el.textContent.trim().length > 0 && isVisible(el) && !isTourUiElement(el)
  );
  // Same innermost-only dedup as exact text matching, so a wrapping container
  // doesn't compete against (and shadow) its own descendant's better score.
  const innermost = candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other))
  );

  let bestScore = -1;
  let bestEl: HTMLElement | null = null;
  let tied = false;

  for (const el of innermost) {
    const score = textSimilarity(el.textContent!.trim(), text);
    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  if (bestEl && bestScore >= FUZZY_TEXT_THRESHOLD && !tied) return bestEl;
  return null;
}

/** Levenshtein-distance similarity ratio in [0, 1]; 1 means identical (case-insensitive). */
function textSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

/** Classic single-row dynamic-programming Levenshtein distance. No dependencies. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, row[j], row[j - 1]);
      prevDiag = temp;
    }
  }

  return row[n];
}

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
