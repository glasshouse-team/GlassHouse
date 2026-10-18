import { setRole } from "@/app/actions/role";
import { cn } from "@/lib/utils";
import type { Viewer } from "@/lib/viewer";

const ROLES = [
  { role: "guest", label: "Guest", who: "Nino" },
  { role: "host", label: "Host", who: "Giorgi" },
] as const;

/** "View as Guest (Nino) / Host (Giorgi)": a cookie instead of a login. Works without JS. */
export function RoleSwitcher({ viewer }: { viewer: Viewer }) {
  return (
    <form
      action={setRole}
      className="flex items-center rounded-full border bg-muted p-0.5 text-xs"
      aria-label="View the app as"
    >
      {ROLES.map(({ role, label, who }) => {
        const active = viewer.role === role;
        return (
          <button
            key={role}
            type="submit"
            name="role"
            value={role}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3 py-2 font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className="hidden sm:inline"> · {who}</span>
          </button>
        );
      })}
    </form>
  );
}
