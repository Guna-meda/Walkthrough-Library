# nextjs-demo

Real Next.js App Router integration check for `walkthrough-lib` — not published as an
npm example, just a checked-in project for re-running the compatibility check after
future releases.

`walkthrough-lib` is installed from the parent package folder (`"walkthrough-lib":
"file:../.."` in package.json), so it always tracks whatever is currently built in
`../../dist`. Run `npm run build` in the repo root first if you've changed the library.

## What it checks

`app/tour-test/page.tsx` is a client component (`"use client"`) that calls `useTour()`
from `walkthrough-lib/react` and starts a one-step Flow against a real button. It
exercises the two things that actually break in a Next.js consumer: SSR (no `window`/
`document` access outside the client boundary) and the client-component boundary
around the hook.

```bash
npm run dev
# visit http://localhost:3000/tour-test, click "Start Tour", click the target button,
# confirm the spotlight/tooltip render and the step advances/completes

npm run build   # the check that actually matters — exercises real module resolution,
                # SSR, and "use client" the way a real deployment pipeline would
npm run start   # then repeat the manual test above against the production build
```

If `npm run build` fails, the error usually points straight at the cause — a `window`/
`document is not defined` means something is running outside a client boundary; a
"Client Component boundary" warning means a hook is being used outside `"use client"`.
