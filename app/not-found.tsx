import Link from "next/link";
import { Button } from "@/components/ui/button";

// Unknown URLs, and pages that call notFound() (a listing that doesn't exist).
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border p-6 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-sm text-muted-foreground">
        The home may no longer be listed, or the link is wrong.
      </p>
      <Button asChild>
        <Link href="/search">Find a home</Link>
      </Button>
    </div>
  );
}
