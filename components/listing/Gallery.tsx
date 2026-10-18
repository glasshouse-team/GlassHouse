import { Images } from "lucide-react";
import Image from "next/image";
import { PhotoPlaceholder } from "@/components/listing/PhotoPlaceholder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PhotoRow } from "@/lib/data/listings";

function Photo({ photo, title, sizes }: { photo: PhotoRow; title: string; sizes: string }) {
  return (
    <Image
      src={photo.url}
      alt={photo.room_label ? `${title}: ${photo.room_label}` : title}
      fill
      sizes={sizes}
      className="object-cover"
    />
  );
}

/** Swipeable photos on phones, one large and four small on wider screens, all in a dialog. */
export function Gallery({ photos, title }: { photos: PhotoRow[]; title: string }) {
  if (photos.length === 0)
    return <PhotoPlaceholder className="aspect-[4/3] w-full rounded-2xl sm:aspect-[21/9]" />;

  const [first, ...rest] = photos;
  return (
    <div className="relative">
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl sm:hidden">
        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-[4/3] w-full shrink-0 snap-center">
            <Photo photo={photo} title={title} sizes="100vw" />
          </div>
        ))}
      </div>
      <div className="hidden h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:grid">
        <div className="relative col-span-2 row-span-2">
          <Photo photo={first} title={title} sizes="50vw" />
        </div>
        {rest.slice(0, 4).map((photo) => (
          <div key={photo.id} className="relative">
            <Photo photo={photo} title={title} sizes="25vw" />
          </div>
        ))}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="absolute right-3 bottom-3 shadow">
            <Images /> All photos ({photos.length})
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{photos.length} photos</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {photos.map((photo) => (
              <figure key={photo.id} className="space-y-1">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Photo photo={photo} title={title} sizes="(min-width: 640px) 50vw, 100vw" />
                </div>
                {photo.room_label && (
                  <figcaption className="text-xs text-muted-foreground capitalize">
                    {photo.room_label}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
