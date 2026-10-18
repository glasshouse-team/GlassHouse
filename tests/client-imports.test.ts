/**
 * Client components ship to every browser, guest and host alike. Nothing they import, directly
 * or through other modules, may reach the seed fixtures (the host's floor, the guest's
 * maximum), server data access, the viewer cookie or agent code. Type-only imports are erased
 * at build time and don't count; a "use server" module ships as a reference, not as code.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_DIRS = ["app", "components", "lib"];
const SERVER_ONLY = [
  /^seed\//,
  /^lib\/data\//,
  /^lib\/viewer\.ts$/,
  /^lib\/events\.ts$/,
  /^agents\//,
  /^tools\//,
];

const IMPORTS = [
  /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

function directive(source: string): string | undefined {
  const code = source.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["'](use client|use server)["']/.exec(code)?.[1];
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((c) => /\.tsx?$/.test(c) && existsSync(c)) ?? null;
}

function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs = IMPORTS.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]));
  return specs.flatMap((spec) => resolveImport(file, spec) ?? []);
}

/** Every server-only module a client file can reach, as an import chain. */
function leaks(entry: string): string[] {
  const found: string[] = [];
  const seen = new Set([entry]);
  const queue: string[][] = [[entry]];
  while (queue.length > 0) {
    const chain = queue.shift()!;
    for (const next of runtimeImports(chain[chain.length - 1])) {
      if (seen.has(next)) continue;
      seen.add(next);
      const rel = path.relative(ROOT, next);
      const route = [...chain, next].map((f) => path.relative(ROOT, f)).join(" -> ");
      if (SERVER_ONLY.some((re) => re.test(rel))) found.push(route);
      else if (directive(readFileSync(next, "utf8")) !== "use server") queue.push([...chain, next]);
    }
  }
  return found;
}

const clientFiles = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).filter(
  (file) => directive(readFileSync(file, "utf8")) === "use client",
);

describe("client components", () => {
  it("are found", () => {
    expect(clientFiles.map((f) => path.relative(ROOT, f))).toContain(
      "components/listing/BookingBox.tsx",
    );
  });

  it("never import server-only modules", () => {
    expect(clientFiles.flatMap(leaks)).toEqual([]);
  });
});
