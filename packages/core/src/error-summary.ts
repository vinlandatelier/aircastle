/**
 * An unexpected error reduced to its class name, string `code`, and stack frames, safe to log.
 * The message, cause, and other properties are dropped because drivers put queries,
 * parameters, and credentials there. Only {@link ErrorSummary.of} creates one.
 */
export class ErrorSummary extends Error {
  readonly code?: string;
  readonly #frames: readonly string[];

  private constructor(type: string, frames: readonly string[], code: string | undefined) {
    super(type);
    this.name = "ErrorSummary";
    this.#frames = frames;
    if (code !== undefined) this.code = code;
    this.stack = [`ErrorSummary: ${type}`, ...frames].join("\n");
  }

  /** Stack frames of the original error, without the header that holds its message. */
  get frames(): readonly string[] {
    return this.#frames;
  }

  static of(error: unknown): ErrorSummary {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (!(error instanceof Error)) return new ErrorSummary(typeof error, [], code);
    const header = `${Error.prototype.toString.call(error)}\n`;
    const frames =
      typeof error.stack === "string" && error.stack.startsWith(header)
        ? error.stack.slice(header.length).split("\n")
        : [];
    return new ErrorSummary(error.constructor.name, frames, code);
  }
}
