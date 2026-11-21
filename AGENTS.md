<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend design system

- Use the local shadcn/ui components in `components/ui/` for controls, cards, feedback, overlays, and navigation. Install missing primitives from the official registry with the shadcn CLI. Preserve the Mira preset `b6UT4h4AdO` and the Radix base.
- Use existing `variant` and `size` props first. Add a typed variant or size to the shared primitive when the design needs a reusable treatment. Keep screen-level layout on semantic wrappers and avoid styling overrides through `className` on component instances.
- Define theme colors and typography with semantic Tailwind CSS v4 tokens in `app/styles.css`. Use Phosphor icons and keep decorative icons hidden from assistive technology.
- Compose forms with `FieldGroup`, `Field`, and `FieldLabel`. Use shadcn loading, empty, error, and pending states. Show action confirmations and errors through the shared Sonner toaster. Give overlays accessible titles and descriptions, and restore keyboard focus on dismissal.
- Use short opacity and transform animations and honor `prefers-reduced-motion`. Verify layouts at narrow and wide widths and check keyboard interaction for new controls.
- Run `npm run check`, `npm test`, and `npm run build` before handing off changes. Use npm to update dependencies and `package-lock.json`.
