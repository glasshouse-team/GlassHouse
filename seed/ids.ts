import { createHash } from "node:crypto";

/** Namespace for Glasshouse seed ids (a fixed random uuid; never change it, or every id moves). */
export const SEED_NAMESPACE = "8b0f6c1e-4f4a-4c39-9a37-2f1d5e0c9a11";

/** RFC 9562 name-based uuid (version 5, SHA-1): the same name always gives the same id. */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const bytes = createHash("sha1").update(ns).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable id for a seed row, so URLs survive re-seeding: `seedId("listing:hero-2")`. */
export function seedId(name: string): string {
  return uuidV5(name, SEED_NAMESPACE);
}
