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
}

export interface Flow {
  id: string;
  title: string;
  version: number;
  steps: Step[];
}
