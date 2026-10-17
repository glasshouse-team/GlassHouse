/**
 * World Labs Marble API client (owner: Temuri, GH-3 / GH-10).
 * Docs: https://docs.worldlabs.ai/api (request shapes checked 2026-10-17).
 *
 * Rule: generate once per version, download every asset into OUR storage, and never
 * call World Labs on a page view. Generation takes about 5 minutes.
 */
import { MissingEnvError } from "./errors";

const BASE_URL = "https://api.worldlabs.ai/marble/v1";

export type MarbleModel = "marble-1.0-draft" | "marble-1.0" | "marble-1.1" | "marble-1.1-plus";

/** Where an input comes from. A `uri` must be public: no cookies, login or referer checks. */
export type SourceRef =
  | { source: "uri"; uri: string }
  | { source: "media_asset"; media_asset_id: string }
  | { source: "data_base64"; data_base64: string; extension?: string };

export type WorldPrompt =
  | { type: "text"; text_prompt: string; disable_recaption?: boolean }
  | {
      type: "image";
      image_prompt: SourceRef;
      text_prompt?: string;
      is_pano?: "auto" | boolean;
      disable_recaption?: boolean;
    }
  | {
      type: "multi-image";
      /** Up to 4 images, or up to 8 with reconstruct_images: true. */
      multi_image_prompt: Array<{ azimuth?: number | null; content: SourceRef }>;
      reconstruct_images?: boolean;
      text_prompt?: string;
      disable_recaption?: boolean;
    }
  | {
      type: "video";
      /** mp4, webm, mov or avi. Keep URL inputs under 20 MB (pnpm video:prepare). */
      video_prompt: SourceRef;
      text_prompt?: string;
      disable_recaption?: boolean;
    };

export interface GenerateWorldRequest {
  world_prompt: WorldPrompt;
  /** Max 64 characters. Metadata only. */
  display_name?: string;
  model?: MarbleModel;
  seed?: number;
  /** Max 10 tags, 32 characters each. */
  tags?: string[];
  permission?: { public?: boolean; allow_id_access?: boolean };
}

export interface MarbleWorld {
  world_id: string;
  display_name: string;
  world_marble_url: string;
  model?: string | null;
  created_at?: string | null;
  assets?: {
    caption?: string | null;
    thumbnail_url?: string | null;
    imagery?: { pano_url?: string | null } | null;
    mesh?: {
      collider_mesh_url?: string | null;
      full_res_mesh_url?: string | null;
      hq_mesh_url?: string | null;
    } | null;
    splats?: {
      /** Size label -> URL, e.g. { "100k": ..., "500k": ..., "full_res": ... }. */
      spz_urls?: Record<string, string> | null;
      semantics_metadata?: {
        metric_scale_factor?: number | null;
        ground_plane_offset?: number | null;
      } | null;
    } | null;
  } | null;
}

export interface MarbleOperation {
  operation_id: string;
  /** false = still running. true + error = failed. true + no error = finished. */
  done: boolean;
  error?: { code?: number | null; message?: string | null } | null;
  /** Progress information; shape is not fixed by the API. */
  metadata?: Record<string, unknown> | null;
  /** The world when done and successful. */
  response?: MarbleWorld | null;
  cost?: { total_credits: number; line_items: Array<{ name: string; credits: number }> } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export class MarbleError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "MarbleError";
  }
}

function apiKey(): string {
  const key = process.env.WORLDLABS_API_KEY?.trim();
  if (!key) throw new MissingEnvError(["WORLDLABS_API_KEY"]);
  return key;
}

const HINTS: Record<number, string> = {
  401: "Invalid or missing WORLDLABS_API_KEY.",
  402: "Not enough World Labs API credits. Buy credits at platform.worldlabs.ai.",
  400: "Bad request. A common cause: the input URL is not publicly fetchable (open it in an incognito window).",
  422: "Validation error. Check the request shape, model name and file size.",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "WLT-Api-Key": apiKey(), ...init?.headers },
  });
  const text = await res.text();
  const body: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const hint = HINTS[res.status] ?? "World Labs request failed.";
    throw new MarbleError(res.status, `${hint} (HTTP ${res.status})`, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Starts a generation. Poll the returned operation until done. */
export function generateWorld(request: GenerateWorldRequest): Promise<MarbleOperation> {
  return call<MarbleOperation>("/worlds:generate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export interface PreparedUpload {
  media_asset: { media_asset_id: string; file_name: string; kind: "image" | "video" };
  upload_info: {
    upload_url: string;
    upload_method: string;
    required_headers?: Record<string, string> | null;
  };
}

/** Step 1 of a direct upload: World Labs returns a media asset id and a signed upload URL. */
export function prepareUpload(input: {
  fileName: string;
  kind: "image" | "video";
  extension?: string;
}): Promise<PreparedUpload> {
  return call<PreparedUpload>("/media-assets:prepare_upload", {
    method: "POST",
    body: JSON.stringify({
      file_name: input.fileName.slice(-64),
      kind: input.kind,
      extension: input.extension,
    }),
  });
}

/**
 * Uploads a file straight to World Labs and returns its `media_asset_id`, for
 * `{ source: "media_asset", media_asset_id }`. No public URL or Supabase needed (GH-3).
 */
export async function uploadMediaAsset(file: {
  fileName: string;
  kind: "image" | "video";
  contentType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const extension = file.fileName.includes(".") ? file.fileName.split(".").pop() : undefined;
  const prepared = await prepareUpload({ fileName: file.fileName, kind: file.kind, extension });
  const { upload_url, upload_method, required_headers } = prepared.upload_info;
  const res = await fetch(upload_url, {
    method: upload_method || "PUT",
    headers: { "Content-Type": file.contentType, ...(required_headers ?? {}) },
    body: file.bytes as BodyInit,
  });
  if (!res.ok) {
    throw new MarbleError(
      res.status,
      `Upload to World Labs failed (HTTP ${res.status})`,
      await res.text(),
    );
  }
  return prepared.media_asset.media_asset_id;
}

export function getOperation(operationId: string): Promise<MarbleOperation> {
  return call<MarbleOperation>(`/operations/${encodeURIComponent(operationId)}`);
}

/** Fetches the latest world. Accepts both `{...world}` and `{ world: {...} }` response shapes. */
export async function getWorld(worldId: string): Promise<MarbleWorld> {
  const body = await call<MarbleWorld | { world: MarbleWorld }>(
    `/worlds/${encodeURIComponent(worldId)}`,
  );
  return "world" in body ? body.world : body;
}

/** A dropped connection ("fetch failed"), a 5xx or a 429 on one poll; the generation goes on. */
function isTransientError(error: unknown): boolean {
  if (error instanceof MarbleError) return error.status >= 500 || error.status === 429;
  return error instanceof TypeError;
}

/**
 * Polls an operation every `intervalMs` until it finishes. Returns the full world. Up to
 * `maxPollErrors` transient poll errors in a row are retried; a failed generation is not.
 */
export async function waitForWorld(
  operationId: string,
  {
    intervalMs = 15_000,
    timeoutMs = 20 * 60_000,
    maxPollErrors = 5,
    onProgress,
  }: {
    intervalMs?: number;
    timeoutMs?: number;
    maxPollErrors?: number;
    onProgress?: (op: MarbleOperation) => void;
  } = {},
): Promise<{ world: MarbleWorld; operation: MarbleOperation }> {
  const deadline = Date.now() + timeoutMs;
  let pollErrors = 0;
  for (;;) {
    let op: MarbleOperation;
    try {
      op = await getOperation(operationId);
      pollErrors = 0;
    } catch (error) {
      if (!isTransientError(error) || ++pollErrors > maxPollErrors) throw error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    onProgress?.(op);
    if (op.done) {
      if (op.error)
        throw new MarbleError(
          500,
          `Generation failed: ${op.error.message ?? "unknown error"}`,
          op.error,
        );
      const worldId = op.response?.world_id;
      if (!worldId) throw new MarbleError(500, "Operation finished without a world_id", op);
      return { world: await getWorld(worldId), operation: op };
    }
    if (Date.now() > deadline)
      throw new MarbleError(408, `Still generating after ${timeoutMs / 60_000} minutes`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Turns a size label like "500k", "1.5m" or "full_res" into a number for sorting. */
export function splatSizeRank(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("full")) return Number.MAX_SAFE_INTEGER;
  const match = l.match(/(\d+(?:\.\d+)?)\s*([km]?)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return match[2] === "m" ? n * 1_000_000 : match[2] === "k" ? n * 1_000 : n;
}

/**
 * Picks the splat for the web (prefers "500k", else the middle size) and the largest one (HQ).
 */
export function pickSplatUrls(world: MarbleWorld): { web: string | null; hq: string | null } {
  const urls = world.assets?.splats?.spz_urls ?? {};
  const labels = Object.keys(urls).sort((a, b) => splatSizeRank(a) - splatSizeRank(b));
  if (labels.length === 0) return { web: null, hq: null };
  const webLabel =
    labels.find((l) => l.toLowerCase() === "500k") ?? labels[Math.floor((labels.length - 1) / 2)];
  return { web: urls[webLabel], hq: urls[labels[labels.length - 1]] };
}

export type WorldAssetKind =
  "splat" | "collider" | "hq_mesh" | "full_res_mesh" | "pano" | "thumbnail";

/** Every downloadable asset of a world, splats smallest first (GH-3 inspect, GH-10 copies). */
export function worldAssets(
  world: MarbleWorld,
): Array<{ kind: WorldAssetKind; label: string; url: string }> {
  const a = world.assets;
  const splats = Object.entries(a?.splats?.spz_urls ?? {})
    .sort(([x], [y]) => splatSizeRank(x) - splatSizeRank(y))
    .map(([label, url]) => ({ kind: "splat" as const, label: `splat ${label}`, url }));
  const others: Array<{ kind: WorldAssetKind; label: string; url?: string | null }> = [
    { kind: "collider", label: "collider mesh", url: a?.mesh?.collider_mesh_url },
    { kind: "hq_mesh", label: "HQ mesh", url: a?.mesh?.hq_mesh_url },
    { kind: "full_res_mesh", label: "full-res mesh", url: a?.mesh?.full_res_mesh_url },
    { kind: "pano", label: "pano", url: a?.imagery?.pano_url },
    { kind: "thumbnail", label: "thumbnail", url: a?.thumbnail_url },
  ];
  return [...splats, ...others.flatMap(({ url, ...rest }) => (url ? [{ ...rest, url }] : []))];
}

/** Scale metadata with safe defaults (1 = scale unknown, left in model units). */
export function worldScale(world: MarbleWorld): {
  metricScaleFactor: number;
  groundPlaneOffset: number;
} {
  const meta = world.assets?.splats?.semantics_metadata;
  return {
    metricScaleFactor: meta?.metric_scale_factor ?? 1,
    groundPlaneOffset: meta?.ground_plane_offset ?? 0,
  };
}
