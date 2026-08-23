export interface StepSelectors {
  testId?: string;
  ariaLabel?: string;
  text?: string;
  cssPath?: string;
}

export type StepPlacement = "top" | "bottom" | "left" | "right";

export type StepAdvanceOn = "click";

export interface Step {
  id: string;
  selectors: StepSelectors;
  title?: string;
  text: string;
  placement?: StepPlacement;
  advanceOn?: StepAdvanceOn;
  /** A path this step lives on, e.g. "/settings" or a trailing wildcard like
   * "/settings/*". Omit for a step that applies regardless of current location
   * (the default — fully backward compatible with flows that predate this field). */
  route?: string;
}

export interface Flow {
  id: string;
  title: string;
  version: number;
  steps: Step[];
}
