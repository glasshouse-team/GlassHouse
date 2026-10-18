import Image from "next/image";
import { ActivityFeed } from "@/components/feed/ActivityFeed";

export const metadata = { title: "Live activity · Glasshouse" };

// Full-screen activity feed for the projector (GH-12, Beka): dark (a `.dark` wrapper, D-023),
// very large type, readable from 5 meters. It covers the site header on purpose.
export default function FeedPage() {
  return (
    <div className="dark fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 sm:px-10">
        <header className="flex items-center gap-4">
          <Image src="/logo-mark.svg" alt="" width={56} height={56} />
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-brand">Glasshouse</span> live activity
          </h1>
        </header>
        <ActivityFeed filter="all" projector />
      </div>
    </div>
  );
}
