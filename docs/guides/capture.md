# TourRecorder (DOM capture)

`TourRecorder` builds a `Flow` by listening to real clicks on your page — no
hand-writing selectors, and no video or screenshot capture of any kind, ever.

```ts
import { TourRecorder } from "walkthrough-lib";

const recorder = new TourRecorder();
recorder.start();
// ...user clicks through the app...
const flow = recorder.exportFlow("onboarding", "Onboarding Tour");
recorder.stop();
```

## How it works

`start(options?: TourRecorderStartOptions)` attaches a capturing-phase `click`
listener to `document` and shows a small floating panel (bottom-left) with a live step
count and a "Finish & Export" button. Every click builds one `Step` from the clicked
element:

| selector | captured from |
|---|---|
| `testId` | the element's `data-testid` attribute, if present |
| `ariaLabel` | the element's `aria-label` attribute, if present |
| `text` | the element's trimmed `textContent`, if non-empty and 60 characters or fewer |
| `cssPath` | a generated `tag:nth-child()` path, walked upward from the element until it uniquely matches via `document.querySelectorAll` |

The step's placeholder `text` (the tooltip instruction, not to be confused with the
`selectors.text` selector above) is generated as `Click "<label>".`, preferring
`ariaLabel`, then the captured text selector, then `testId` — or `"Click this
element."` if none of those are available. `placement` defaults to `"bottom"`. You'll
typically want to replace this placeholder copy by hand, or with the optional
[AI copy helper](ai-copy.md).

Clicks on the recorder's own floating panel are ignored — they don't get captured as
steps.

## `stop(): void`

Detaches the click listener and removes the floating panel. Does **not** clear
whatever steps have been captured — `exportFlow()` still works after `stop()`.

## `exportFlow(id: string, title: string): Flow`

Returns everything captured so far as a `Flow` (`version: 1`), ready to hand straight
to `TourPlayer.start()` or serialize to a JSON file. Can be called multiple times, or
before `stop()`.

## "Finish & Export" button

Clicking it calls `exportFlow("captured-flow", document.title || "Captured flow")`,
stops recording, logs both the `Flow` object and its JSON string to the console, and
copies the JSON to the clipboard via `navigator.clipboard.writeText` (best-effort — a
failure here only logs a `console.warn`, it never throws).

## Production-host safety warning

On `start()`, if `window.location.hostname` is not `localhost`, `127.0.0.1`, or listed
in `options.allowedHosts`, a `console.warn` fires noting that the capture tool looks
like it's running on a production host and isn't meant for shipping to real users:

```ts
recorder.start({ allowedHosts: ["staging.myapp.com"] });
```

This is a **warning only** — it never throws or blocks capture. It exists purely to
catch an accidental production import of the capture tool; a developer working against
a legitimate staging domain passes its hostname to silence it.

## Record → export → replay workflow

1. Open `examples/capture-demo.html` (after `npm run build`) — recording starts
   automatically.
2. Click through the page (e.g. "+ New Project", the settings icon, the email field,
   Submit).
3. Click "Finish & Export" — the captured flow JSON is logged to the console and
   copied to your clipboard.
4. Paste that JSON into the `flow` variable in `examples/demo.html` (or any app using
   `TourPlayer`) to replay exactly what you just clicked through.
5. Optionally run each captured step through [`suggestStepCopy`](ai-copy.md) before
   replaying, to replace the placeholder `"Click ..."` text with better copy.

---
Back to [README](../../README.md) · full schema in [docs/SPEC.md](../SPEC.md)
