import type { Flow, Step, StepSelectors } from "./types.js";

export interface TourPlayerOptions {
  onStepUnresolved?: (step: Step) => void;
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

export class TourPlayer {
  private flow: Flow | null = null;
  private currentIndex = -1;
  private onStepUnresolved: ((step: Step) => void) | undefined;

  private spotlightEl: HTMLDivElement | null = null;
  private tooltipEl: HTMLDivElement | null = null;
  private currentTarget: Element | null = null;
  private currentClickHandler: ((ev: Event) => void) | null = null;
  private repositionHandler: (() => void) | null = null;

  start(flow: Flow, options: TourPlayerOptions = {}): void {
    this.stop();
    this.flow = flow;
    this.onStepUnresolved = options.onStepUnresolved;
    this.currentIndex = -1;
    this.advance(0);
  }

  next(): void {
    if (!this.flow) return;
    this.advance(this.currentIndex + 1);
  }

  stop(): void {
    this.teardownStepUI();
    this.flow = null;
    this.currentIndex = -1;
    this.onStepUnresolved = undefined;
  }

  /** Walks forward from startIndex, skipping any step whose target can't be resolved. */
  private advance(startIndex: number): void {
    if (!this.flow) return;
    let index = startIndex;
    while (index < this.flow.steps.length) {
      const step = this.flow.steps[index];
      const target = this.resolveTarget(step.selectors);
      if (target) {
        this.currentIndex = index;
        this.renderStep(step, target);
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

  /** Tries selectors.testId -> ariaLabel -> text -> cssPath, in that order (see docs/SPEC.md). */
  private resolveTarget(selectors: StepSelectors): Element | null {
    if (selectors.testId) {
      const el = matchUniqueBySelector(`[data-testid="${cssAttrEscape(selectors.testId)}"]`);
      if (el) return el;
    }
    if (selectors.ariaLabel) {
      const el = matchUniqueBySelector(`[aria-label="${cssAttrEscape(selectors.ariaLabel)}"]`);
      if (el) return el;
    }
    if (selectors.text) {
      const el = matchUniqueByText(selectors.text);
      if (el) return el;
    }
    if (selectors.cssPath) {
      try {
        const el = document.querySelector(selectors.cssPath);
        if (el && !isTourUiElement(el)) return el;
      } catch {
        // invalid selector string — fall through to unresolved
      }
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

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
