import Image from "next/image";
import { cn } from "@/lib/utils";

/** Shown where a listing has no photos yet (seed photos arrive later, seed/PHOTOS.md). */
export function PhotoPlaceholder({
  className,
  label = "Photos coming soon",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/10 via-muted to-brand-accent/10 text-xs text-muted-foreground",
        className,
      )}
    >
      <Image src="/logo-mark.svg" alt="" width={32} height={32} className="opacity-60" />
      {label}
    </div>
  );
}
