import { Star } from "lucide-react";
import { reviewMonth, subRatingAverages } from "@/components/listing/format";
import type { ReviewRow } from "@/lib/data/listings";

/** Overall rating, the six sub-rating bars and the review cards. */
export function ReviewsSection({
  reviews,
  rating,
}: {
  reviews: ReviewRow[];
  rating: number | null;
}) {
  if (reviews.length === 0)
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      </section>
    );

  return (
    <section className="space-y-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Star className="size-5 fill-current" aria-hidden />
        {rating?.toFixed(1) ?? "New"} · {reviews.length}{" "}
        {reviews.length === 1 ? "review" : "reviews"}
      </h2>
      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        {subRatingAverages(reviews).map(({ key, label, average }) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <dt className="w-32 shrink-0">{label}</dt>
            <dd className="flex flex-1 items-center gap-3">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground"
                  style={{ width: `${((average ?? 0) / 5) * 100}%` }}
                />
              </span>
              <span className="w-7 text-right tabular-nums">{average?.toFixed(1) ?? "-"}</span>
            </dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-6 sm:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.id} className="space-y-1 text-sm">
            <p className="font-medium">{review.author_name ?? "Guest"}</p>
            <p className="text-xs text-muted-foreground">
              {reviewMonth(review.created_at)} · {review.rating}/5
            </p>
            <p className="leading-relaxed">{review.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
