export class KaiError extends Error {
  override readonly name: string = "KaiError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ToolError extends KaiError {
  override readonly name = "ToolError";
}

export class ProtocolError extends KaiError {
  override readonly name = "ProtocolError";
}

export class AbortedError extends KaiError {
  override readonly name = "AbortedError";
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : JSON.stringify(value));
}
