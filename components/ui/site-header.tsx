import Image from "next/image";
import Link from "next/link";
import { RoleSwitcher } from "@/components/ui/role-switcher";
import type { Viewer } from "@/lib/viewer";

const linkClass = "text-muted-foreground hover:text-foreground";

/** Logo, search entry, the host's dashboard link and the role switcher. */
export function SiteHeader({ viewer }: { viewer: Viewer }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 text-sm sm:gap-5">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Glasshouse home">
          <Image src="/logo-mark.svg" alt="" width={28} height={28} priority />
          <span className="hidden text-base font-semibold tracking-tight text-brand sm:inline">
            Glasshouse
          </span>
        </Link>
        <Link href="/search" className={linkClass}>
          Search
        </Link>
        {viewer.role === "host" && (
          <Link href="/host/dashboard" className={linkClass}>
            Dashboard
          </Link>
        )}
        <Link href="/feed" className={`${linkClass} hidden sm:inline`}>
          Feed
        </Link>
        <div className="ml-auto">
          <RoleSwitcher viewer={viewer} />
        </div>
      </nav>
    </header>
  );
}
