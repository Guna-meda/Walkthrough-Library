import type { Flow } from "walkthrough-lib";
import { useTour } from "walkthrough-lib/react";
import "./App.css";

const flow: Flow = {
  id: "onboarding-demo",
  title: "Demo onboarding flow (React)",
  version: 1,
  steps: [
    {
      id: "step-1",
      selectors: {
        testId: "create-project-btn",
        ariaLabel: "Create new project",
        text: "+ New Project",
      },
      title: "Create a project",
      text: "Click here to create your first project.",
      placement: "right",
    },
    {
      id: "step-2",
      selectors: {
        ariaLabel: "Open settings",
      },
      title: "Open settings",
      text: "Click the settings icon to configure your app.",
      placement: "right",
    },
    {
      id: "step-3",
      selectors: {
        text: "Submit",
      },
      title: "Submit the form",
      text: "Click submit to save your changes.",
      placement: "top",
    },
    {
      id: "step-4",
      selectors: {
        cssPath: '#signup-form input[type="email"]',
      },
      title: "Enter your email",
      text: "Click the email field to enter your address.",
      placement: "bottom",
    },
  ],
};

export default function App() {
  const { start, stop, currentStepId, isActive } = useTour();

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>MyApp</h2>
        <button className="nav-btn" data-testid="create-project-btn" aria-label="Create new project">
          + New Project
        </button>
        <button className="nav-btn" aria-label="Open settings">
          &#9881; Settings
        </button>
      </aside>
      <main className="content">
        <h1>Dashboard</h1>
        <p>Welcome to your dashboard. Use the sidebar to create a project, or update your profile below.</p>
        <form id="signup-form" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" placeholder="you@example.com" />
          <button type="submit">Submit</button>
        </form>
      </main>

      <div className="status-bar">
        {isActive ? `useTour(): active step = "${currentStepId}"` : "useTour(): not active"}
      </div>

      <div className="demo-controls">
        {isActive && (
          <button className="stop-tour" type="button" onClick={stop}>
            Stop Tour
          </button>
        )}
        <button className="start-tour" type="button" onClick={() => start(flow)}>
          Start Tour
        </button>
      </div>
    </div>
  );
}
