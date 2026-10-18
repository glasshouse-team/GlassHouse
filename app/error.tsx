"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Friendly fallback when a page fails to render. Next 16 passes `retry`, which re-renders it.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page didn&apos;t load. Try again, or go back to the homes.
      </p>
      <div className="flex justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/search">Find a home</Link>
        </Button>
      </div>
    </div>
  );
}
