// Shared by page-a.html and page-b.html so both pages agree on step ids/routes.
export const flow = {
  id: "multipage-demo",
  title: "Multi-page demo tour",
  version: 1,
  steps: [
    {
      id: "step-1",
      route: "/examples/multipage-demo/page-a.html",
      selectors: { testId: "go-to-page-b" },
      title: "Go to Page B",
      text: "Click this link to continue the tour on another page.",
      placement: "bottom",
    },
    {
      id: "step-2",
      route: "/examples/multipage-demo/page-b.html",
      selectors: { testId: "finish-btn" },
      title: "Finish the tour",
      text: "You made it across pages! Click Finish to complete the tour.",
      placement: "bottom",
    },
  ],
};
