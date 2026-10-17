import { ZodError, type ZodType } from "zod";
import { MissingEnvError, NotImplementedError } from "./errors";

/** 501 response used by API stubs until their ticket is built. */
export function notImplemented(ticket: string, what: string): Response {
  return Response.json(
    {
      error: "not_implemented",
      ticket,
      message: `${what} is built in ${ticket}. See docs/tickets/${ticket}.md.`,
    },
    { status: 501 },
  );
}

/** Parses and validates a JSON body. Throws ZodError on bad input. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const body: unknown = await request.json().catch(() => ({}));
  return schema.parse(body);
}

/** Maps known errors to JSON responses. Never leaks secrets or stack traces. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ error: "invalid_input", issues: error.issues }, { status: 400 });
  }
  if (error instanceof NotImplementedError) {
    return Response.json(
      { error: "not_implemented", ticket: error.ticket, message: error.message },
      { status: 501 },
    );
  }
  if (error instanceof MissingEnvError) {
    return Response.json({ error: "missing_env", keys: error.keys }, { status: 500 });
  }
  console.error(error);
  return Response.json({ error: "internal_error" }, { status: 500 });
}
