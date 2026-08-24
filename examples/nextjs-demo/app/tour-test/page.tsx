"use client";

import { useTour } from "walkthrough-lib/react";
import type { Flow } from "walkthrough-lib";
import "walkthrough-lib/style.css";

const testFlow: Flow = {
  id: "smoke-test",
  title: "Smoke Test",
  version: 1,
  steps: [
    {
      id: "step-1",
      selectors: { testId: "test-btn" },
      text: "Click this button to test the tour.",
    },
  ],
};

export default function TourTestPage() {
  const { start, isActive, currentStepId } = useTour();

  return (
    <div style={{ padding: 40 }}>
      <h1>Next.js Smoke Test</h1>
      <p>
        Active: {String(isActive)} | Step: {currentStepId ?? "none"}
      </p>
      <button onClick={() => start(testFlow)}>Start Tour</button>
      <br />
      <br />
      <button data-testid="test-btn">Target Button</button>
    </div>
  );
}
