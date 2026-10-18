"use client";
import { Button } from "@/components/ui/button";
import { WARNING_TEXT, type CaptureWarning } from "./logic/warnings";

export interface UploadJob {
  key: string;
  label: string;
  progress: number;
  status: "uploading" | "done" | "failed";
  error?: string;
  flags: string[];
  /** Indexes of the rooms this capture covers. */
  rooms: number[];
  /** Set once the upload is confirmed (PATCH /api/captures/{id}). */
  captureId?: string;
  retry: () => void;
}

function flagText(flag: string): string {
  if (flag === "no_compass") return "No compass track";
  return WARNING_TEXT[flag as CaptureWarning] ?? flag;
}

/** Upload progress and the quality report, one line per capture. */
export function UploadPanel({ jobs }: { jobs: UploadJob[] }) {
  if (!jobs.length) return null;
  return (
    <ul className="space-y-3" aria-label="Uploads">
      {jobs.map((job) => (
        <li key={job.key} className="rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{job.label}</span>
            <span
              className={
                job.status === "failed"
                  ? "text-destructive"
                  : job.status === "done"
                    ? "text-brand"
                    : "text-muted-foreground"
              }
            >
              {job.status === "uploading"
                ? `${Math.round(job.progress * 100)}%`
                : job.status === "done"
                  ? "Uploaded"
                  : "Failed"}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(job.progress * 100)}
            aria-label={`${job.label} upload`}
          >
            <div
              className={`h-full transition-[width] ${job.status === "failed" ? "bg-destructive" : "bg-brand"}`}
              style={{ width: `${Math.round(job.progress * 100)}%` }}
            />
          </div>
          {job.flags.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Quality: {job.flags.map(flagText).join(" · ")}
            </p>
          )}
          {job.status === "failed" && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-destructive">{job.error}</span>
              <Button size="xs" variant="outline" onClick={job.retry}>
                Try again
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
