import type { Flow, Step, StepPlacement, StepSelectors } from "./types.js";

const CAPTURE_PANEL_CLASS = "tourlib-capture-panel";
const MAX_SELECTOR_TEXT_LENGTH = 60;
const DEFAULT_PLACEMENT: StepPlacement = "bottom";
const DEFAULT_FLOW_ID = "captured-flow";

export class TourRecorder {
  private recording = false;
  private steps: Step[] = [];
  private clickHandler: ((ev: MouseEvent) => void) | null = null;
  private panelEl: HTMLDivElement | null = null;
  private countEl: HTMLElement | null = null;

  start(): void {
    if (this.recording) return;
    this.recording = true;
    this.steps = [];

    this.clickHandler = (ev) => this.handleClick(ev);
    document.addEventListener("click", this.clickHandler, true);

    this.renderPanel();
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false;

    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true);
      this.clickHandler = null;
    }

    this.panelEl?.remove();
    this.panelEl = null;
    this.countEl = null;
  }

  /** Returns everything captured so far as a Flow, ready for TourPlayer.start(). */
  exportFlow(id: string, title: string): Flow {
    return {
      id,
      title,
      version: 1,
      steps: this.steps.slice(),
    };
  }

  private handleClick(ev: MouseEvent): void {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`.${CAPTURE_PANEL_CLASS}`)) return;

    this.steps.push(buildStepFromElement(target, this.steps.length + 1));
    this.updateCount();
  }

  private renderPanel(): void {
    this.panelEl = document.createElement("div");
    this.panelEl.className = CAPTURE_PANEL_CLASS;

    const status = document.createElement("div");
    status.className = "tourlib-capture-status";
    const dot = document.createElement("span");
    dot.className = "tourlib-capture-dot";
    status.appendChild(dot);
    status.appendChild(document.createTextNode("Recording..."));
    this.panelEl.appendChild(status);

    this.countEl = document.createElement("div");
    this.countEl.className = "tourlib-capture-count";
    this.panelEl.appendChild(this.countEl);
    this.updateCount();

    const finishBtn = document.createElement("button");
    finishBtn.type = "button";
    finishBtn.className = "tourlib-btn tourlib-btn-next";
    finishBtn.textContent = "Finish & Export";
    finishBtn.addEventListener("click", () => this.finishAndExport());
    this.panelEl.appendChild(finishBtn);

    document.body.appendChild(this.panelEl);
  }

  private updateCount(): void {
    if (!this.countEl) return;
    const n = this.steps.length;
    this.countEl.textContent = `${n} step${n === 1 ? "" : "s"} captured`;
  }

  private finishAndExport(): void {
    const flow = this.exportFlow(DEFAULT_FLOW_ID, document.title || "Captured flow");
    this.stop();

    const json = JSON.stringify(flow, null, 2);
    console.log("walkthrough-lib: captured flow", flow);
    console.log(json);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch((err) => {
        console.warn("walkthrough-lib: could not copy flow JSON to clipboard", err);
      });
    }
  }
}

function buildStepFromElement(el: Element, index: number): Step {
  const testId = el.getAttribute("data-testid") || undefined;
  const ariaLabel = el.getAttribute("aria-label") || undefined;
  const rawText = (el.textContent ?? "").trim();
  const text = rawText.length > 0 && rawText.length <= MAX_SELECTOR_TEXT_LENGTH ? rawText : undefined;
  const cssPath = generateUniqueCssPath(el);

  const selectors: StepSelectors = {};
  if (testId) selectors.testId = testId;
  if (ariaLabel) selectors.ariaLabel = ariaLabel;
  if (text) selectors.text = text;
  if (cssPath) selectors.cssPath = cssPath;

  const label = ariaLabel || text || testId;

  return {
    id: `step-${index}`,
    selectors,
    text: label ? `Click "${label}".` : "Click this element.",
    placement: DEFAULT_PLACEMENT,
  };
}

/** Walks up from el adding tag:nth-child() segments until document.querySelectorAll
 * on the built-up path returns exactly this one element. */
function generateUniqueCssPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;

  while (current) {
    segments.unshift(cssSegmentForElement(current));
    const path = segments.join(" > ");
    if (isUniquePath(path)) return path;
    if (current === document.documentElement) break;
    current = current.parentElement;
  }

  return segments.join(" > ");
}

function cssSegmentForElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const index = Array.from(parent.children).indexOf(el) + 1;
  return `${tag}:nth-child(${index})`;
}

function isUniquePath(path: string): boolean {
  try {
    return document.querySelectorAll(path).length === 1;
  } catch {
    return false;
  }
}
