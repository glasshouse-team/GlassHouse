import {
  AirVent,
  Armchair,
  ArrowUpDown,
  Baby,
  Bath,
  Beef,
  Building,
  Car,
  Check,
  Coffee,
  CookingPot,
  Fence,
  Flame,
  Heater,
  KeyRound,
  Laptop,
  Mountain,
  Sailboat,
  SquareParking,
  Sun,
  ThermometerSun,
  Trees,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { amenityLabel } from "@/components/listing/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Amenity } from "@/lib/schemas/core";

const ICONS: Record<Amenity, LucideIcon> = {
  wifi: Wifi,
  dedicated_workspace: Laptop,
  kitchen: CookingPot,
  washer: WashingMachine,
  dryer: Wind,
  dishwasher: UtensilsCrossed,
  coffee_maker: Coffee,
  heating: Heater,
  air_conditioning: AirVent,
  fireplace: Flame,
  free_parking: SquareParking,
  street_parking: Car,
  elevator: ArrowUpDown,
  tv: Tv,
  balcony: Fence,
  terrace: Sun,
  garden: Trees,
  bbq_grill: Beef,
  hot_tub: Bath,
  sauna: ThermometerSun,
  mountain_view: Mountain,
  sea_view: Sailboat,
  city_view: Building,
  self_check_in: KeyRound,
  crib: Baby,
  high_chair: Armchair,
};

const SHOWN = 10;

function AmenityItem({ amenity }: { amenity: string }) {
  const Icon = ICONS[amenity as Amenity] ?? Check;
  return (
    <li className="flex items-center gap-3 text-sm">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      {amenityLabel(amenity)}
    </li>
  );
}

/** Amenities: the first ten as an icon grid, the rest in a dialog. */
export function AmenityGrid({ amenities }: { amenities: string[] }) {
  if (amenities.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Amenities</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {amenities.slice(0, SHOWN).map((a) => (
          <AmenityItem key={a} amenity={a} />
        ))}
      </ul>
      {amenities.length > SHOWN && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">See all {amenities.length} amenities</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>All {amenities.length} amenities</DialogTitle>
            </DialogHeader>
            <ul className="grid gap-3">
              {amenities.map((a) => (
                <AmenityItem key={a} amenity={a} />
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
