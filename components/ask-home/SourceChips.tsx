import { BookOpen, Camera, ScrollText } from "lucide-react";
import { sourceLabel } from "./source-label";
import type { QaMessage } from "./thread";

const ICONS = { fact: Camera, rule: ScrollText, manual: BookOpen } as const;

/** Where an answer came from: "House rules: Pets: ...", "Seen in photos: washer". */
export function SourceChips({ sources }: { sources: QaMessage["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="flex max-w-full flex-wrap gap-1.5" aria-label="Sources">
      {sources.map((source) => {
        const Icon = ICONS[source.type];
        const label = sourceLabel(source);
        return (
          <li
            key={`${source.type}:${source.key}`}
            title={source.quote ? `${label}\n\n"${source.quote}"` : label}
            className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-900"
          >
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
