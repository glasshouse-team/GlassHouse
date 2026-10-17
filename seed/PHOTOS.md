# Seed photos (GH-7)

`pnpm seed` uploads whatever is in `seed/photos/<slug>/` to `media/listings/{id}/photos/` and mirrors that Storage folder into `listing_photos`. The folder is git-ignored: photos never go in the repo. Re-run `pnpm seed` after adding or removing photos.

## Rules

- **Names:** `NN-room.jpg` (or `.png`, `.webp`): two digits for the order, then the room in lower case with dashes, e.g. `01-living-room.jpg`. The room becomes the photo's label; other files are ignored.
- **Licence:** your own photos, or free-licence stock (Unsplash or Pexels licence). Never Airbnb photos. Record every stock photo in the credits table below.
- **Size:** under 2 MB each (resize to about 1600 px wide).
- **Truthful except the two lies:** the X-ray (GH-9) compares photos with the listing, so every photo must agree with the listing's amenities and text. Only the two lie listings may contradict it, exactly as described below.

## Hero homes (Temuri, GH-6)

Real photos of the filmed homes, uploaded straight to `media/listings/{id}/photos/` with the same names (hero-1 id `00000000-0000-4000-8000-0000000000b1`, hero-2 id `00000000-0000-4000-8000-0000000000b2`), or dropped into `seed/photos/hero-1/` and `seed/photos/hero-2/`.

- hero-1 needs: the living room with the fireplace and the desk by the window, both bedrooms (the view of the mountain from one window), the kitchen, the bathroom, and one photo that clearly shows the washing machine named `NN-laundry.jpg` (the `washer` fact points at it). No hair dryer in any photo.

## Shot list for the other ten (about 50 photos)

| Slug                                 | Photos (in order)                                                            | Must show / must not show                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `batumi-sea-view-flat` (**lie 1**)   | 01-living-room, 02-bedroom, 03-kitchen, 04-bathroom, 05-balcony, 06-entrance | The balcony looks onto a courtyard and other buildings. **No photo may show the sea, the shore or any open water.** |
| `sighnaghi-family-house` (**lie 2**) | 01-garden, 02-bedroom, 03-bedroom-2, 04-kitchen, 05-bathroom                 | Each bedroom has exactly two single beds (4 in total). **No sofa bed, bunk bed or extra mattress anywhere.**        |
| `kazbegi-gergeti-cabin`              | 01-cabin, 02-living-room, 03-bedroom, 04-terrace, 05-view                    | Wooden cabin, a fireplace, mountains from the terrace. No desk.                                                     |
| `kazbegi-alpine-chalet`              | 01-chalet, 02-living-room, 03-sauna, 04-hot-tub, 05-bedroom                  | Fireplace, sauna and an outdoor hot tub facing mountains; a desk corner if possible.                                |
| `kazbegi-stepantsminda-guesthouse`   | 01-room, 02-view, 03-common-room, 04-bathroom                                | One double bed; mountains from the window.                                                                          |
| `tbilisi-sololaki-loft`              | 01-living-room, 02-reading-nook, 03-desk, 04-sleeping-gallery, 05-kitchen    | High ceilings, a long desk, steep stairs to the gallery, rooftop city view.                                         |
| `tbilisi-vake-family-apartment`      | 01-living-room, 02-bedroom, 03-kids-room, 04-kitchen, 05-desk                | Hills seen from the living room, a crib, a desk. No fireplace.                                                      |
| `tbilisi-old-town-balcony-flat`      | 01-balcony, 02-living-room, 03-bedroom, 04-kitchen, 05-street                | Carved wooden balcony; the bedroom window over a street.                                                            |
| `batumi-old-town-studio`             | 01-studio, 02-kitchenette, 03-bathroom, 04-street                            | One room with one bed.                                                                                              |
| `sighnaghi-vineyard-guesthouse`      | 01-terrace, 02-vineyard, 03-bedroom, 04-bedroom-2, 05-dining                 | Terrace over the valley with mountains on the horizon, a garden.                                                    |

## Credits

| Slug | File | Photographer | Source URL | Licence |
| ---- | ---- | ------------ | ---------- | ------- |
|      |      |              |            |         |
