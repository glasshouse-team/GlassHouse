---
name: ui-pages
description: Build Glasshouse pages and UI with Next.js 16 App Router, React 19, Tailwind 4 and shadcn/ui - search, listing page with slots, booking box, deal room, host dashboard, trip page, role switcher. Use for GH-8 and the UI parts of GH-14, GH-15, GH-21 and GH-23.
when_to_use: The user mentions "build the listing page", "search page", "booking box", "host dashboard", "deal room UI", "role switcher", "make it responsive", "add a shadcn component", "page layout", any change under app/ that is not an API route.
---

# Pages and UI

## Read before writing

Next.js is 16.4 and differs from older versions. Before using a routing or rendering API, read the matching guide in `node_modules/next/dist/docs/01-app/` (for example `01-getting-started/03-layouts-and-pages.md`). Key facts for this repo:

- `params` and `searchParams` are Promises: `export default async function Page(props: PageProps<"/listing/[id]">) { const { id } = await props.params; }`. `PageProps`, `LayoutProps` and `RouteContext` are global types, no import needed.
- Cache Components is **off** (next.config.ts, docs/DECISIONS.md). Pages that read cookies or the database are dynamic automatically.
- Server Components by default. Add `"use client"` only to components with state, effects, event handlers or browser APIs. Keep client components small and pass data down from server components.

## Data

- Server components read with `supabaseAdmin()` through small functions in `lib/data/<thing>.ts` (create the folder when needed). Validate rows with the Zod schemas.
- Client components fetch with TanStack Query (`useQuery`, provider in app/providers.tsx) from API routes, and subscribe to Realtime with `supabaseBrowser()`.
- Prices: always from `computeQuote`; show with `formatCents` (lib/utils.ts).

## Components

- shadcn/ui is configured (`components.json`). Add what you need: `pnpm dlx shadcn@latest add button card dialog sheet calendar tabs badge input textarea separator skeleton`. Components land in `components/ui/`.
- Icons: lucide-react. Toasts: `import { toast } from "sonner"`.
- Brand tokens are in app/globals.css (`bg-brand`, `text-brand`, `bg-honesty`). GH-4 sets the final colors and font. No Airbnb branding.

## Slots (do not edit Temuri's components)

The listing page renders `XrayPanel`, `TourLauncher`, `FloorPlanCard`, `AskThisHome`; the host dashboard renders `QuestionsWaiting`, `GapTasks`, `WorldVersions`, `CaptureLauncher`. Import and place them; pass only ids. Their files belong to Temuri (docs/OWNERSHIP.md).

## Layout patterns (see the reverse-engineer-airbnb skill)

- Mobile first: design at 375 px, then `sm:`, `lg:`. No horizontal scroll.
- Listing page: two columns from `lg:` (content left, booking card right, `sticky top-20`); on phones the booking card becomes a sticky bottom bar.
- Search: brief box on top, results grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Deal room: offer timeline (cards with actor, amount, difference from list, reason) plus the activity feed.

## Role switcher (GH-8)

A cookie `gh_role` = `guest` or `host`, set by a small server action or route, read with `cookies()` in server components. Demo people: guest Nino, hosts Giorgi and Ana (seed). No real login.

## Every page

- Loading and empty states (Skeleton), friendly errors.
- Human actions (Reserve, Approve, Decline) call an API route that logs an event.
- Check it: `pnpm dev`, then at phone width in the browser, then on a real phone via ngrok when it matters.
