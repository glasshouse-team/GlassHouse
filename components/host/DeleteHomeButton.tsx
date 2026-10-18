"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface DeleteHomeButtonProps {
  listingId: string;
  title: string;
}

/**
 * Deletes one of the host's homes after a confirm step (D-044). The server refuses demo homes
 * and homes with upcoming stays or live deals, and says why; the message shows as a toast.
 */
export function DeleteHomeButton({ listingId, title }: DeleteHomeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/listings/${listingId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(body.message ?? "Could not delete the home. Try again.");
        return;
      }
      toast.success(`${title} is deleted.`);
      setOpen(false);
      // Drop ?home= so the dashboard opens on the first remaining home.
      router.replace("/host/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8"
        >
          <Trash2 aria-hidden /> Delete home
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {title}?</DialogTitle>
          <DialogDescription>
            Guests can no longer find or book it. Its photos, reviews, 3D versions, agent rules and
            past deals are removed too. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-11 sm:h-9">
              Keep it
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="h-11 sm:h-9"
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? "Deleting..." : "Delete home"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
