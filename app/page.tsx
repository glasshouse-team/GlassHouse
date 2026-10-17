import Link from "next/link";

// Developer index for the starter. GH-8 replaces this page with the real home page.
const ROUTES = [
  {
    href: "/search",
    what: "Search: trip brief to shortlist",
    ticket: "GH-8 / GH-14",
    owner: "Beka",
  },
  {
    href: "/listing/demo",
    what: "Listing page with the X-ray, tour, floor plan and Q&A slots",
    ticket: "GH-8",
    owner: "Beka",
  },
  { href: "/tour/demo", what: "Walkable 3D tour", ticket: "GH-11", owner: "Temuri" },
  { href: "/deal/demo", what: "Deal room: agents negotiate live", ticket: "GH-15", owner: "Beka" },
  {
    href: "/trip/demo",
    what: "Trip page and check-in verification",
    ticket: "GH-23",
    owner: "Beka",
  },
  {
    href: "/host/dashboard",
    what: "Host dashboard: approvals, questions, gaps, 3D versions",
    ticket: "GH-8",
    owner: "Beka",
  },
  {
    href: "/host/capture/demo",
    what: "Guided walkthrough capture (phone)",
    ticket: "GH-22",
    owner: "Temuri",
  },
  {
    href: "/feed",
    what: "Activity feed, full screen for the projector",
    ticket: "GH-12",
    owner: "Beka",
  },
  {
    href: "/tools/rig?world=demo",
    what: "Gap-check screenshot rig (hidden tool)",
    ticket: "GH-19",
    owner: "Temuri",
  },
  { href: "/demo/check", what: "Demo pre-flight checks", ticket: "GH-26", owner: "Beka" },
  {
    href: "/api/health",
    what: "API health: which keys are configured",
    ticket: "GH-2",
    owner: "Beka",
  },
];

export default function DevIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Glasshouse starter</h1>
        <p className="mt-1 text-neutral-500">
          Every route below exists as a placeholder that names the ticket that builds it. Start with{" "}
          <code>docs/tickets/INDEX.md</code> or ask Claude Code to <code>/start-ticket GH-2</code>.
        </p>
      </div>
      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {ROUTES.map((route) => (
          <li
            key={route.href}
            className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Link href={route.href} className="font-medium underline-offset-4 hover:underline">
                {route.href}
              </Link>
              <p className="text-sm text-neutral-500">{route.what}</p>
            </div>
            <span className="text-xs text-neutral-500">
              {route.ticket} · {route.owner}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
