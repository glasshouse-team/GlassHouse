import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { needsIssue, severitySummary } from "@/lib/checkin";
import type { StoredCheckinReport } from "@/lib/schemas/checkin";
import { OpenIssueButton } from "./OpenIssueButton";

interface Props {
  report: StoredCheckinReport;
  reservationId: string;
  /** listing_photos.id -> url, to show the listed photo next to the arrival frame. */
  photoUrls: Record<string, string>;
  /** The frames as data URLs, in frame order (only right after a check-in; frames are not stored). */
  thumbnails?: string[];
  canOpenIssue: boolean;
}

const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

function frameLabel(id: string): string {
  return `Frame ${Number(id.replace(/\D/g, "")) || id}`;
}

/** The Verifier's check-in report: matches in green, differences in amber with the frames. */
export function CheckinReport({
  report,
  reservationId,
  photoUrls,
  thumbnails,
  canOpenIssue,
}: Props) {
  const summary = severitySummary(report);
  const thumb = (frameId: string) => thumbnails?.[report.frame_ids.indexOf(frameId)];
  const listed = (label: string) => (label ? photoUrls[report.photo_ids[label] ?? ""] : undefined);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        The Verifier compared {report.frame_ids.length} arrival frames with the listing:{" "}
        <span className="font-medium text-foreground">
          {report.matches.length} as listed,{" "}
          {summary.total === 0
            ? "no differences"
            : `${summary.total} difference${summary.total === 1 ? "" : "s"}`}
        </span>
        .
      </p>

      {report.differences.length > 0 && (
        <section className="space-y-3" aria-label="Differences">
          <h3 className="font-semibold">Differences</h3>
          <ul className="space-y-3">
            {report.differences.map((d) => {
              const frame = thumb(d.evidence_frame);
              const photo = listed(d.listing_photo);
              return (
                <li
                  key={`${d.room}-${d.seen}`}
                  className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950"
                >
                  <div className="flex items-start gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium capitalize">
                        {d.room || "Room"}
                        <Badge
                          variant="outline"
                          className="border-amber-400 bg-white text-amber-800 normal-case"
                        >
                          {SEVERITY_LABEL[d.severity]}
                        </Badge>
                      </p>
                      <p>
                        <span className="text-amber-800">Listed:</span> {d.listed}
                      </p>
                      <p>
                        <span className="text-amber-800">Seen:</span> {d.seen}
                      </p>
                    </div>
                  </div>
                  {/* Frames are not stored: a saved report shows images only from listing photos. */}
                  {(photo || frame) && (
                    <div className="grid grid-cols-2 gap-2">
                      <figure className="space-y-1">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- listing photos come from Storage
                          <img
                            src={photo}
                            alt={`Listing photo of the ${d.room}`}
                            className="aspect-video w-full rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center rounded-lg bg-white/70 text-xs text-amber-800">
                            No listing photo
                          </div>
                        )}
                        <figcaption className="text-xs text-amber-800">Listing</figcaption>
                      </figure>
                      <figure className="space-y-1">
                        {frame ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a data URL from this browser
                          <img
                            src={frame}
                            alt={`${frameLabel(d.evidence_frame)} of the arrival`}
                            className="aspect-video w-full rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center rounded-lg bg-white/70 text-xs text-amber-800">
                            {frameLabel(d.evidence_frame)}
                          </div>
                        )}
                        <figcaption className="text-xs text-amber-800">
                          Arrival, {frameLabel(d.evidence_frame).toLowerCase()}
                        </figcaption>
                      </figure>
                    </div>
                  )}
                  {!photo && !frame && (
                    <p className="pl-6 text-xs text-amber-800">
                      Seen in {frameLabel(d.evidence_frame).toLowerCase()}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {canOpenIssue && needsIssue(report) && <OpenIssueButton reservationId={reservationId} />}
        </section>
      )}

      {report.matches.length > 0 && (
        <section className="space-y-2" aria-label="As listed">
          <h3 className="font-semibold">As listed</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {report.matches.map((m) => (
              <li
                key={`${m.room}-${m.item}`}
                className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-950"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="min-w-0">
                  <span className="capitalize">{m.room}</span>: {m.item}
                  <span className="block text-xs text-emerald-800">
                    {frameLabel(m.evidence_frame)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.missing_items.length > 0 && (
        <section className="space-y-2" aria-label="Not seen">
          <h3 className="font-semibold">Not seen in the frames</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {report.missing_items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        The Verifier works for neither side and reports only what the frames show.
      </p>
    </div>
  );
}
