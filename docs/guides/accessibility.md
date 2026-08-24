# Accessibility

`TourPlayer` ships keyboard, focus, and screen-reader support out of the box — no
opt-in required, no extra dependency. This page documents exactly what's implemented
(verified against `src/player.ts`), and is honest about what hasn't been formally
tested or covered.

## What's supported

- **Escape** stops the tour at any point (`document`-level `keydown` listener), the
  same code path as the tooltip's Skip button — see
  [player.md](player.md#onflowabandoned-semantics) for what that means for
  `onFlowAbandoned`.
- **Focus trap**: while a step's tooltip is shown, Tab/Shift+Tab cycles through the
  tooltip's own focusable elements (its Skip/Next buttons). Focus is restored to
  whatever had it before the tour started (or before the current step's tooltip took
  it) once the tooltip is torn down, whether that's a step-to-step transition or
  `.stop()`.
- **Screen readers**: a visually-hidden `aria-live="polite"` (`role="status"`,
  `aria-atomic="true"`) region announces each step's title/text automatically the
  moment it renders — no need to tab to the tooltip to hear what changed.
- **ARIA roles**: the tooltip carries `role="dialog"` and `aria-modal="false"` (chosen
  over `alertdialog`, since a tooltip is informational and non-blocking rather than an
  urgent interruption), with `aria-labelledby`/`aria-describedby` wired to its
  title/text elements.

All of the above is exercised manually in a real browser via `examples/demo.html` (see
[Step 10 in docs/ROADMAP.md](../ROADMAP.md)) — aria-live text, focus movement/trap, and
Escape teardown are all confirmed there, not just unit-tested against the DOM API.

## Known gap: Tab is globally intercepted while a tooltip is shown

The focus trap is stricter than "non-modal, page stays interactive" might suggest. The
keydown handler intercepts **every** Tab/Shift+Tab press document-wide as long as a
tooltip element exists — not just presses that originate from inside the tooltip. In
practice this means: while a step's tooltip is visible, a keyboard-only user cannot Tab
past it to reach other focusable elements on the page (including the spotlighted target
itself, if it isn't one of the tooltip's own buttons) — pressing Tab from anywhere
redirects focus into the tooltip's first/last focusable element. A mouse/pointer user
can still click the spotlighted target directly (that's how the tour advances on
`advanceOn: "click"`), so the page remains interactive in that sense, but keyboard
navigation is effectively scoped to the tooltip for the duration of the step. This
hasn't caused a reported issue, but it's worth knowing if you're auditing
keyboard-only flows.

## Not formally tested

This library has **not** been audited or tested against WCAG success criteria, and no
claim of WCAG conformance (A/AA/AAA) is made. What's documented above is what's been
manually verified to work in a real browser (Chrome, via `examples/demo.html`) — not
the result of an automated accessibility audit (e.g. axe-core) or testing with real
assistive technology (a screen reader like NVDA/JAWS/VoiceOver). If accessibility
compliance is a hard requirement for your use case, verify independently before relying
on this library as-is.

Other gaps, not yet addressed:
- No high-contrast / `prefers-reduced-motion` handling — the spotlight/tooltip entrance
  transition (see `src/style.css`, `--tour-transition-duration`) always animates.
- The spotlight overlay element itself has no `aria-hidden` attribute — it's an empty,
  non-text `<div>`, so this is unlikely to be announced by screen readers, but it also
  hasn't been explicitly verified with one.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
