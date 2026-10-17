/** Thrown by starter stubs. Points at the ticket that builds the missing piece. */
export class NotImplementedError extends Error {
  constructor(
    public readonly ticket: string,
    what = "This",
  ) {
    super(`${what} is not implemented yet. It is built in ${ticket} (docs/tickets/${ticket}.md).`);
    this.name = "NotImplementedError";
  }
}

/** Thrown when required environment variables are missing. */
export class MissingEnvError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `Missing environment variables: ${keys.join(", ")}. Add them to .env.local (see docs/SETUP.md).`,
    );
    this.name = "MissingEnvError";
  }
}
