/**
 * 4-6 reviews per seed listing (docs/teardown.md section 5). Ratings are integers 1-5;
 * `sub` is [cleanliness, accuracy, check_in, communication, location, value].
 * Hero-1 carries five claims GH-24 can pin in 3D; two reviews back up the X-ray lies.
 */
import { LIE_LISTING_SLUGS } from "../fixtures";

export interface SeedReview {
  author: string;
  rating: number;
  sub: [number, number, number, number, number, number];
  body: string;
  /** "YYYY-MM": when the stay was reviewed. */
  month: string;
}

export const SEED_REVIEWS: Record<string, SeedReview[]> = {
  "hero-1": [
    {
      author: "Mariam",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Woke up to Mount Kazbek from the bedroom window every morning, and the fireplace made the evenings.",
      month: "2026-09",
    },
    {
      author: "Luka",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 4],
      body: "The desk by the living-room window was perfect for video calls. The wifi held up all week.",
      month: "2026-08",
    },
    {
      author: "Sophie",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Lovely stone house and a very kind host. Only note: the shower pressure in the bathroom is weak.",
      month: "2026-07",
    },
    {
      author: "Daniel",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "The small bedroom gets cold at night; the fireplace only heats the living room. Bring warm socks.",
      month: "2026-06",
    },
    {
      author: "Elene",
      rating: 5,
      sub: [5, 4, 5, 5, 5, 5],
      body: "Great base for the Gergeti hike. The sofa in the living room is too short to sleep on, so count the beds before you book.",
      month: "2026-05",
    },
  ],
  "hero-2": [
    {
      author: "Tamar",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Bright, quiet flat and a real desk in the second bedroom. Ten minutes to Rustaveli on foot.",
      month: "2026-09",
    },
    {
      author: "Jonas",
      rating: 4,
      sub: [4, 5, 4, 5, 5, 4],
      body: "Good apartment. The elevator only fits two people and a suitcase.",
      month: "2026-08",
    },
    {
      author: "Nika",
      rating: 5,
      sub: [5, 5, 5, 5, 4, 5],
      body: "Fast internet, coffee on the balcony in the morning, easy check-in.",
      month: "2026-06",
    },
    {
      author: "Ilaria",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "Nice place in a lovely neighbourhood. The kitchen could use a few more pans.",
      month: "2026-05",
    },
  ],
  [LIE_LISTING_SLUGS.seaView]: [
    {
      author: "Giga",
      rating: 3,
      sub: [4, 2, 4, 4, 4, 3],
      body: "Nice flat, but we couldn't see the sea from the balcony, only the courtyard and the next building.",
      month: "2026-09",
    },
    {
      author: "Anna",
      rating: 4,
      sub: [5, 3, 5, 5, 4, 4],
      body: "Clean and cool with the air conditioning on. The beach is a ten-minute walk away.",
      month: "2026-08",
    },
    {
      author: "Mehmet",
      rating: 4,
      sub: [4, 4, 4, 5, 5, 4],
      body: "Close to the boulevard and the restaurants. The host met us in the lobby.",
      month: "2026-07",
    },
    {
      author: "Olga",
      rating: 4,
      sub: [4, 3, 5, 5, 4, 4],
      body: "Comfortable for a short stay. The photos made it look bigger.",
      month: "2026-07",
    },
  ],
  [LIE_LISTING_SLUGS.sleepsSix]: [
    {
      author: "Levan",
      rating: 3,
      sub: [4, 2, 4, 4, 5, 3],
      body: "Only four single beds, two of us slept on the floor. The garden is lovely though.",
      month: "2026-09",
    },
    {
      author: "Keti",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "Great garden and barbecue, a short walk to the town walls.",
      month: "2026-08",
    },
    {
      author: "Paul",
      rating: 4,
      sub: [4, 4, 4, 4, 5, 4],
      body: "Charming old house. Fine for four, tight for more.",
      month: "2026-06",
    },
    {
      author: "Natela",
      rating: 5,
      sub: [5, 4, 5, 5, 5, 5],
      body: "The kids loved the garden and the crib was clean and sturdy.",
      month: "2026-05",
    },
  ],
  "kazbegi-gergeti-cabin": [
    {
      author: "Alex",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "Cozy cabin and the fireplace is great, but the internet is too slow for work calls.",
      month: "2026-09",
    },
    {
      author: "Salome",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "The view from the terrace is unreal. We walked to Gergeti church in the morning.",
      month: "2026-08",
    },
    {
      author: "Tom",
      rating: 4,
      sub: [4, 5, 4, 4, 5, 4],
      body: "Rustic and warm. The bedroom is small, the mountains make up for it.",
      month: "2026-07",
    },
    {
      author: "Dato",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Perfect hiking base, the host waited for us at the gate late at night.",
      month: "2026-06",
    },
  ],
  "kazbegi-alpine-chalet": [
    {
      author: "Clara",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 4],
      body: "Sauna after a day of hiking, then the hot tub under the stars. Pricey but worth it for a group.",
      month: "2026-09",
    },
    {
      author: "Irakli",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 4],
      body: "Huge kitchen, four real bedrooms, and the fireplace kept everyone in the living room.",
      month: "2026-08",
    },
    {
      author: "Emma",
      rating: 4,
      sub: [4, 5, 4, 4, 5, 3],
      body: "Beautiful chalet. Check-out at 10:00 is early for a group of eight.",
      month: "2026-07",
    },
    {
      author: "Sandro",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "The study corner had fast internet, so I could work for a day without missing the view.",
      month: "2026-06",
    },
  ],
  "kazbegi-stepantsminda-guesthouse": [
    {
      author: "Mia",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Warm room, warm family, and the mountains right outside the window.",
      month: "2026-09",
    },
    {
      author: "Gela",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 5],
      body: "Simple and clean, great value. The wifi only works in the common room.",
      month: "2026-08",
    },
    {
      author: "Hannah",
      rating: 4,
      sub: [4, 4, 4, 5, 5, 4],
      body: "Small room for two people with big backpacks, but very central.",
      month: "2026-07",
    },
    {
      author: "Petre",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Good coffee in the morning and good advice on hikes from the owners.",
      month: "2026-06",
    },
  ],
  "tbilisi-sololaki-loft": [
    {
      author: "Lena",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 4],
      body: "I worked from the long desk all week; the internet never dropped. The reading nook is the best corner in the flat.",
      month: "2026-09",
    },
    {
      author: "Ramaz",
      rating: 4,
      sub: [4, 4, 5, 4, 5, 4],
      body: "Great loft, but the stairs up to the sleeping gallery are steep at night.",
      month: "2026-08",
    },
    {
      author: "Chloe",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Cozy living room, rooftop views and lots of cafés around Sololaki.",
      month: "2026-07",
    },
    {
      author: "Beso",
      rating: 4,
      sub: [4, 5, 5, 5, 4, 4],
      body: "Stylish and quiet. Parking on the street took a while to find.",
      month: "2026-06",
    },
    {
      author: "Yuki",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Smart-lock check-in was easy and the bed was very comfortable.",
      month: "2026-05",
    },
  ],
  "tbilisi-vake-family-apartment": [
    {
      author: "Natia",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 4],
      body: "Perfect for our family: crib, high chair and the park across the street.",
      month: "2026-09",
    },
    {
      author: "Mark",
      rating: 4,
      sub: [4, 5, 5, 4, 5, 4],
      body: "Big apartment with a view of the hills from the living room. No discounts, but fair price.",
      month: "2026-08",
    },
    {
      author: "Ketevan",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "The garage space saved us a lot of time, and the concierge was helpful.",
      month: "2026-07",
    },
    {
      author: "Omar",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "Comfortable and quiet. One bathroom fan is noisy.",
      month: "2026-06",
    },
  ],
  "tbilisi-old-town-balcony-flat": [
    {
      author: "Julia",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "The carved balcony is magical, but the bedroom window faces a noisy street.",
      month: "2026-09",
    },
    {
      author: "Saba",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Five minutes to the sulphur baths and the old town. Great host.",
      month: "2026-08",
    },
    {
      author: "Lucas",
      rating: 4,
      sub: [4, 4, 4, 5, 5, 5],
      body: "Old building with character. Bring earplugs on weekends.",
      month: "2026-07",
    },
    {
      author: "Eka",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Our dog was welcome and loved the courtyard.",
      month: "2026-06",
    },
    {
      author: "Marta",
      rating: 4,
      sub: [4, 4, 5, 4, 5, 4],
      body: "Cute flat, small kitchen. Parking nearby is hard.",
      month: "2026-05",
    },
  ],
  "batumi-old-town-studio": [
    {
      author: "Archil",
      rating: 4,
      sub: [4, 5, 5, 4, 5, 5],
      body: "Small but well planned, and the keypad check-in was easy.",
      month: "2026-09",
    },
    {
      author: "Sara",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Great value near Europe Square, lots of cafés around.",
      month: "2026-08",
    },
    {
      author: "Viktor",
      rating: 4,
      sub: [4, 4, 4, 4, 5, 4],
      body: "Fine for one or two nights. The air conditioning is loud.",
      month: "2026-07",
    },
    {
      author: "Lika",
      rating: 4,
      sub: [4, 4, 5, 5, 5, 4],
      body: "Quiet lane, clean studio, tiny kitchen.",
      month: "2026-06",
    },
  ],
  "sighnaghi-vineyard-guesthouse": [
    {
      author: "Ben",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Dinner with house wine on the terrace, the Caucasus glowing at sunset. Unforgettable.",
      month: "2026-09",
    },
    {
      author: "Tinatin",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "The family made us feel at home. Lovely garden and barbecue.",
      month: "2026-08",
    },
    {
      author: "Rafael",
      rating: 4,
      sub: [4, 4, 5, 5, 4, 4],
      body: "Beautiful spot, but you need a car to reach the town.",
      month: "2026-07",
    },
    {
      author: "Ia",
      rating: 4,
      sub: [4, 5, 4, 5, 4, 5],
      body: "Peaceful and green. The wifi is slow on the terrace.",
      month: "2026-06",
    },
    {
      author: "Sven",
      rating: 5,
      sub: [5, 5, 5, 5, 5, 5],
      body: "Best breakfast of the trip and a great view of the valley.",
      month: "2026-05",
    },
  ],
};
