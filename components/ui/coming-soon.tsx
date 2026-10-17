import type { ReactNode } from "react";

/** Placeholder card used by starter stubs. Each one names the ticket and owner that replaces it. */
export function ComingSoon({
  title,
  ticket,
  owner,
  children,
}: {
  title: string;
  ticket: string;
  owner: "Temuri" | "Beka";
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm dark:border-neutral-700">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {ticket} · {owner}
        </span>
      </div>
      <p className="mt-1 text-neutral-500">
        Placeholder. Built in {ticket}, see <code>docs/tickets/{ticket}.md</code>.
      </p>
      {children}
    </section>
  );
}
