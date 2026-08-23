import type { Flow, Step, StepSelectors } from "./types.js";
import { writeState, readState, isExpired, clearState, DEFAULT_EXPIRY_MS } from "./persistence.js";

/** Identifies which flow/step was abandoned — deliberately just the two fields needed
 * for a host app to log/report it, not the full Step (no selector/PII data). */
export interface FlowAbandonedInfo {
  flowId: string;
  stepIndex: number;
}

export interface TourPlayerOptions {
  onStepUnresolved?: (step: Step) => void;
  /** Fires with the newly-active step whenever one renders, and with null when the
   * tour becomes inactive (stopped, skipped, or finished). Optional — the player
   * works the same with or without it; this only exists so a host UI (e.g. the React
   * wrapper) can mirror "which step is active" without polling. */
  onStepChange?: (step: Step | null) => void;
  /** Fires when a tour is abandoned: either .stop() is called explicitly while a step
   * is active and the flow hasn't finished, or (via getResumableState()) a persisted
   * resumable state for a flow turns out to have expired. Never fires just because the
   * page unloaded mid-tour — see docs/SPEC.md for the full semantics. */
  onFlowAbandoned?: (info: FlowAbandonedInfo) => void;
  /** Interval, in ms, between resolution attempts for a step whose `route` differs
   * from the previous step's (see docs/SPEC.md). Default 150. */
  pollIntervalMs?: number;
  /** How long, in ms, to keep polling before giving up and treating the step as
   * unresolved. Default 5000. */
  pollTimeoutMs?: number;
  /** Step index to start at instead of 0 — the explicit way to resume a persisted
   * tour. Get this from getResumableState(); the player never resumes on its own. */
  resumeFromStep?: number;
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
const VISUALLY_HIDDEN_CLASS = "tourlib-visually-hidden";
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

const NAVIGATION_EVENT = "tourlib:navigation";
let historyPatched = false;

/** Wraps history.pushState/replaceState (once per page, regardless of how many
 * TourPlayer instances exist) to also dispatch NAVIGATION_EVENT, so SPA route changes
 * that don't trigger popstate/hashchange are still detected. Preserves the original
 * call's behavior and return value exactly. */
function patchHistoryOnce(): void {
  if (historyPatched || typeof history === "undefined") return;
  historyPatched = true;
  (["pushState", "replaceState"] as const).forEach((method) => {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
      return result;
    };
  });
}

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
  private onFlowAbandoned: ((info: FlowAbandonedInfo) => void) | undefined;

  private ariaLiveEl: HTMLDivElement | null = null;
  private focusBeforeTooltip: HTMLElement | null = null;

  private pollIntervalMs = 150;
  private pollTimeoutMs = 5000;
  // Bumped on every start()/stop()/advance() call; an in-flight poll checks this
  // before acting on its result so a stopped/restarted tour can't render a step late.
  private advanceToken = 0;

  start(flow: Flow, options: TourPlayerOptions = {}): void {
    this.stop();
    this.flow = flow;
    this.onStepUnresolved = options.onStepUnresolved;
    this.onStepChange = options.onStepChange;
    this.onFlowAbandoned = options.onFlowAbandoned;
    this.pollIntervalMs = options.pollIntervalMs ?? 150;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 5000;
    this.currentIndex = -1;
    this.matchLog = [];
    this.setupAriaLive();
    document.addEventListener("keydown", this.handleKeydown);
    patchHistoryOnce();
    window.addEventListener(NAVIGATION_EVENT, this.handleNavigationEvent);
    window.addEventListener("popstate", this.handleNavigationEvent);
    window.addEventListener("hashchange", this.handleNavigationEvent);
    void this.advance(options.resumeFromStep ?? 0);
  }

  next(): void {
    if (!this.flow) return;
    void this.advance(this.currentIndex + 1);
  }

  /** Stops the tour. If a step was active and the flow hadn't finished, this counts as
   * abandonment and fires onFlowAbandoned (see docs/SPEC.md) — unlike a natural
   * completion, which tears down the same UI but isn't an abandonment. */
  stop(): void {
    this.stopInternal(false);
  }

  private stopInternal(completed: boolean): void {
    const wasActive = this.flow !== null && this.currentIndex >= 0;
    const abandonedFlow = this.flow;
    const abandonedStepIndex = this.currentIndex;
    this.advanceToken++;
    this.teardownStepUI();
    document.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener(NAVIGATION_EVENT, this.handleNavigationEvent);
    window.removeEventListener("popstate", this.handleNavigationEvent);
    window.removeEventListener("hashchange", this.handleNavigationEvent);
    this.teardownAriaLive();
    this.flow = null;
    this.currentIndex = -1;
    this.onStepUnresolved = undefined;
    const onStepChange = this.onStepChange;
    const onFlowAbandoned = this.onFlowAbandoned;
    this.onStepChange = undefined;
    this.onFlowAbandoned = undefined;
    if (wasActive) {
      onStepChange?.(null);
      if (!completed && abandonedFlow) {
        onFlowAbandoned?.({ flowId: abandonedFlow.id, stepIndex: abandonedStepIndex });
      }
    }
  }

  /** Which selector strategy resolved each step played so far, in play order. */
  getMatchLog(): MatchLogEntry[] {
    return this.matchLog.slice();
  }

  /** Call on page load, before .start(), to check whether a persisted tour can be
   * resumed. Returns { flowId, stepIndex } only if the persisted state matches the
   * given flow's id/version and hasn't expired — resuming is always the host app's
   * explicit choice via .start(flow, { resumeFromStep }); the player never resumes on
   * its own. If the persisted state exists but has expired, this is exactly the
   * "discovered after the fact" abandonment case (b) in docs/SPEC.md: onFlowAbandoned
   * fires (if provided) and the stale state is cleared so it isn't reported twice. */
  getResumableState(
    flow: Flow,
    options: { expiryMs?: number; onFlowAbandoned?: (info: FlowAbandonedInfo) => void } = {}
  ): { flowId: string; stepIndex: number } | null {
    const state = readState();
    if (!state) return null;
    if (state.flowId !== flow.id || state.flowVersion !== flow.version) return null;
    const expiryMs = options.expiryMs ?? DEFAULT_EXPIRY_MS;
    if (isExpired(state, expiryMs)) {
      options.onFlowAbandoned?.({ flowId: state.flowId, stepIndex: state.stepIndex });
      clearState();
      return null;
    }
    return { flowId: state.flowId, stepIndex: state.stepIndex };
  }

  /** Manually signal that navigation may have happened, for apps that don't want
   * history.pushState/replaceState patched or whose router doesn't fire popstate/
   * hashchange. Automatic detection (see patchHistoryOnce) calls this too. */
  notifyNavigation(): void {
    this.handleNavigation();
  }

  private handleNavigationEvent = (): void => {
    this.handleNavigation();
  };

  /** Re-attempts resolution of the currently active step if its target has gone stale
   * (removed from the document, e.g. by an SPA route change) — using the poll-based
   * resolver in case the step's route now matches. A still-valid current target means
   * nothing changed as far as the tour is concerned, so this is a no-op. */
  private handleNavigation(): void {
    if (!this.flow || this.currentIndex < 0) return;
    if (this.currentTarget && document.contains(this.currentTarget)) return;
    void this.advance(this.currentIndex);
  }

  /** Walks forward from startIndex, skipping any step whose target can't be resolved.
   * A step whose `route` differs from the previous step's is polled (see
   * pollResolveTarget) instead of resolved instantly, since a navigation may just have
   * happened and the new page's DOM may not be ready yet. */
  private async advance(startIndex: number): Promise<void> {
    if (!this.flow) return;
    const flow = this.flow;
    const token = ++this.advanceToken;
    let index = startIndex;
    while (index < flow.steps.length) {
      const step = flow.steps[index];
      const needsPoll = index > 0 && step.route !== undefined && step.route !== flow.steps[index - 1].route;
      const match = needsPoll ? await this.pollResolveTarget(step.selectors) : this.resolveTarget(step.selectors);
      if (token !== this.advanceToken) return; // stopped or restarted while we were waiting
      if (match) {
        this.currentIndex = index;
        this.matchLog.push({ stepId: step.id, strategy: match.strategy });
        this.renderStep(step, match.element);
        writeState({ flowId: flow.id, stepIndex: index, flowVersion: flow.version, timestamp: Date.now() });
        this.onStepChange?.(step);
        return;
      }
      this.onStepUnresolved?.(step);
      index++;
    }
    this.stopInternal(true);
  }

  /** Retries resolveTarget on pollIntervalMs until it succeeds or pollTimeoutMs
   * elapses, giving a freshly-navigated-to page's DOM time to render. */
  private pollResolveTarget(
    selectors: StepSelectors
  ): Promise<{ element: Element; strategy: MatchStrategy } | null> {
    const deadline = Date.now() + this.pollTimeoutMs;
    return new Promise((resolve) => {
      const attempt = () => {
        const match = this.resolveTarget(selectors);
        if (match || Date.now() >= deadline) {
          resolve(match);
          return;
        }
        setTimeout(attempt, this.pollIntervalMs);
      };
      attempt();
    });
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
    // A guided tooltip is informational and non-blocking — the spotlighted page
    // element behind it stays interactive and is exactly what the user is meant to
    // act on next. role="alertdialog" implies an urgent, typically modal interruption
    // demanding immediate response, which doesn't fit; role="dialog" (non-modal here,
    // hence aria-modal="false") is the better match.
    this.tooltipEl.setAttribute("role", "dialog");
    this.tooltipEl.setAttribute("aria-modal", "false");
    this.tooltipEl.tabIndex = -1;

    const textId = `tourlib-tooltip-text-${step.id}`;
    if (step.title) {
      const titleId = `tourlib-tooltip-title-${step.id}`;
      const titleEl = document.createElement("div");
      titleEl.className = "tourlib-tooltip-title";
      titleEl.id = titleId;
      titleEl.textContent = step.title;
      this.tooltipEl.appendChild(titleEl);
      this.tooltipEl.setAttribute("aria-labelledby", titleId);
      this.tooltipEl.setAttribute("aria-describedby", textId);
    } else {
      this.tooltipEl.setAttribute("aria-labelledby", textId);
    }

    const textEl = document.createElement("div");
    textEl.className = "tourlib-tooltip-text";
    textEl.id = textId;
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

    this.announce(step);
    this.moveFocusIntoTooltip(nextBtn);
  }

  /** Updates the shared aria-live region so screen readers announce the new step's
   * instruction automatically, without moving the user's focus to do it. */
  private announce(step: Step): void {
    if (!this.ariaLiveEl) return;
    this.ariaLiveEl.textContent = step.title ? `${step.title}: ${step.text}` : step.text;
  }

  /** Saves whatever had focus so it can be restored later (see teardownStepUI), then
   * moves focus into the new tooltip — onto its primary action by default. */
  private moveFocusIntoTooltip(preferredEl: HTMLElement): void {
    if (!this.tooltipEl) return;
    this.focusBeforeTooltip = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    preferredEl.focus();
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

    // Restore focus to wherever it was before this tooltip took it — whether the
    // tour just stopped or is about to render the next step's tooltip on top.
    if (this.focusBeforeTooltip && document.contains(this.focusBeforeTooltip)) {
      this.focusBeforeTooltip.focus();
    }
    this.focusBeforeTooltip = null;
  }

  /** Escape stops the tour like .stop() does; Tab/Shift+Tab is trapped within the
   * active tooltip's focusable elements while one is shown. Bound as a class field
   * (not a method) so the same reference can be added/removed from `document`. */
  private handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      this.stop();
      return;
    }
    if (ev.key === "Tab" && this.tooltipEl) {
      this.trapTabKey(ev);
    }
  };

  private trapTabKey(ev: KeyboardEvent): void {
    const tooltipEl = this.tooltipEl;
    if (!tooltipEl) return;
    const focusable = getFocusableElements(tooltipEl);
    if (focusable.length === 0) {
      ev.preventDefault();
      tooltipEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeIsInside = active instanceof Node && tooltipEl.contains(active);
    if (ev.shiftKey) {
      if (!activeIsInside || active === first) {
        ev.preventDefault();
        last.focus();
      }
    } else {
      if (!activeIsInside || active === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  private setupAriaLive(): void {
    this.ariaLiveEl = document.createElement("div");
    this.ariaLiveEl.className = VISUALLY_HIDDEN_CLASS;
    this.ariaLiveEl.setAttribute("role", "status");
    this.ariaLiveEl.setAttribute("aria-live", "polite");
    this.ariaLiveEl.setAttribute("aria-atomic", "true");
    document.body.appendChild(this.ariaLiveEl);
  }

  private teardownAriaLive(): void {
    this.ariaLiveEl?.remove();
    this.ariaLiveEl = null;
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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable descendants of a tooltip, in DOM order — used by the Tab trap. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
