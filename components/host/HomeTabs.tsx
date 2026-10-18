"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stepHome } from "./home-tabs";

export interface HomeTab {
  id: string;
  slug: string;
  title: string;
}

export interface HomeTabsProps {
  homes: HomeTab[];
  /** Index of the home to open first (from `?home=`). */
  initial: number;
  /** One panel per home, in the same order as `homes`. */
  children: React.ReactNode;
}

/**
 * The host's homes as tabs (GH-8): one home's tools at a time, picked from a tab row that
 * scrolls sideways, or with the arrows (keyboard: left and right). The open home goes in
 * `?home=<slug>` so a reload or a shared link opens it again; Home and End jump to the ends. Every panel stays mounted, so
 * unsaved form edits survive switching tabs.
 */
export function HomeTabs({ homes, initial, children }: HomeTabsProps) {
  const [active, setActive] = useState(initial);
  // A client-side visit to another ?home= keeps this component mounted: follow the new value
  // (adjusted while rendering, as React recommends, instead of in an effect).
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setActive(initial);
  }
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = Children.toArray(children);

  // Bring the open tab into view inside the tab row only; scrollIntoView would scroll the page.
  useEffect(() => {
    const tab = tabs.current[active];
    const row = tab?.parentElement;
    if (!tab || !row) return;
    const left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollTo({ left: left - (row.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  function open(index: number, focus = false) {
    setActive(index);
    if (focus) tabs.current[index]?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set("home", homes[index].slug);
    window.history.replaceState(null, "", url);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const target =
      event.key === "ArrowRight"
        ? stepHome(active, 1, homes.length)
        : event.key === "ArrowLeft"
          ? stepHome(active, -1, homes.length)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? homes.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    open(target, true);
  }

  if (homes.length === 0) return null;
  return (
    <section className="space-y-4" aria-label="Your homes">
      <div className="flex items-center gap-2">
        {homes.length > 1 && (
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0 sm:size-9"
            aria-label="Previous home"
            onClick={() => open(stepHome(active, -1, homes.length))}
          >
            <ChevronLeft aria-hidden />
          </Button>
        )}
        <div
          role="tablist"
          aria-label="Your homes"
          onKeyDown={onKeyDown}
          className="thin-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1.5"
        >
          {homes.map((home, i) => (
            <button
              key={home.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`home-tab-${home.id}`}
              aria-selected={i === active}
              aria-controls={`home-panel-${home.id}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => open(i)}
              className={cn(
                "min-h-11 max-w-60 shrink-0 truncate rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                i === active
                  ? "border-brand bg-brand text-white"
                  : "bg-background text-foreground hover:bg-accent",
              )}
              title={home.title}
            >
              {home.title}
            </button>
          ))}
        </div>
        {homes.length > 1 && (
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0 sm:size-9"
            aria-label="Next home"
            onClick={() => open(stepHome(active, 1, homes.length))}
          >
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Home {active + 1} of {homes.length}
      </p>
      {homes.map((home, i) => (
        <div
          key={home.id}
          role="tabpanel"
          id={`home-panel-${home.id}`}
          aria-labelledby={`home-tab-${home.id}`}
          hidden={i !== active}
        >
          {panels[i]}
        </div>
      ))}
    </section>
  );
}
