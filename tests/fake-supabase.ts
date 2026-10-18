/**
 * A small in-memory stand-in for the supabase-js client, for route and pipeline tests.
 * It covers the query builder calls our server code uses (select with a column list,
 * insert, update, eq, neq, in, not is null, match, order, limit, single, maybeSingle),
 * unique keys (Postgres code 23505) and Storage upload, list and signed upload URLs.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeSupabaseOptions {
  /** Unique keys per table, e.g. { worlds: [["listing_id", "version", "spot"]] }. */
  unique?: Record<string, string[][]>;
  /** Column defaults per table, applied on insert. */
  defaults?: Record<string, Row>;
}

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  files: Map<string, { bytes: number; contentType?: string }>;
  client: unknown;
}

function project(row: Row, columns: string): Row {
  if (columns.trim() === "*") return { ...row };
  return Object.fromEntries(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => [c, row[c] ?? null]),
  );
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private columns: string | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;

  constructor(
    private readonly fake: FakeSupabase,
    private readonly table: string,
    private readonly options: FakeSupabaseOptions,
  ) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  not(col: string, op: string, value: unknown) {
    if (op !== "is") throw new Error(`fake supabase: not(${op}) is not supported`);
    this.filters.push((r) => (r[col] ?? null) !== value);
    return this;
  }
  match(values: Row) {
    for (const [k, v] of Object.entries(values)) this.eq(k, v);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private rows(): Row[] {
    return (this.fake.tables[this.table] ??= []);
  }

  private run(): { data: unknown; error: unknown } {
    let result: Row[];
    if (this.op === "insert") {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const fresh = values.map((v) => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...this.options.defaults?.[this.table],
        ...v,
      }));
      for (const key of this.options.unique?.[this.table] ?? []) {
        const seen = new Set<string>();
        for (const r of [...this.rows(), ...fresh]) {
          const k = JSON.stringify(key.map((c) => r[c]));
          if (seen.has(k)) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          seen.add(k);
        }
      }
      this.rows().push(...fresh);
      result = fresh;
    } else {
      result = this.rows().filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") for (const r of result) Object.assign(r, this.payload);
      if (this.op === "delete") {
        this.fake.tables[this.table] = this.rows().filter((r) => !result.includes(r));
      }
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result = [...result].sort((a, b) => {
        const x = a[col] as number | string;
        const y = b[col] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.max !== null) result = result.slice(0, this.max);
    const shaped =
      this.columns === null && this.op !== "select"
        ? null
        : result.map((r) => project(r, this.columns ?? "*"));
    if (this.mode === "many") return { data: shaped, error: null };
    const list = shaped ?? [];
    if (this.mode === "single" && list.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: `${list.length} rows` } };
    }
    return { data: list[0] ?? null, error: null };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const fake: FakeSupabase = { tables: {}, files: new Map(), client: null };
  fake.client = {
    from: (table: string) => new Query(fake, table, options),
    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          bytes: Uint8Array,
          opts: { contentType?: string } = {},
        ) => {
          fake.files.set(`${bucket}/${path}`, {
            bytes: bytes.length,
            contentType: opts.contentType,
          });
          return { data: { path }, error: null };
        },
        list: async (folder: string) => {
          const prefix = `${bucket}/${folder.replace(/\/$/, "")}/`;
          const data = [...fake.files.entries()]
            .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
            .map(([k, f]) => ({ name: k.slice(prefix.length), metadata: { size: f.bytes } }));
          return { data, error: null };
        },
        createSignedUploadUrl: async (path: string) => ({
          data: { path, signedUrl: `https://fake.storage/upload/${bucket}/${path}`, token: "t" },
          error: null,
        }),
      }),
    },
  };
  return fake;
}
