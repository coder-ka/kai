import type { z } from "zod";
import type { MaybePromise } from "./types.js";

/** Runtime context handed to every tool invocation. */
export interface ToolContext {
  /** Working directory the run was started in. */
  readonly cwd: string;
  /** Identifier of the current run. */
  readonly runId: string;
  /** Aborted when the run is cancelled. */
  readonly signal: AbortSignal;
  /** Emit a diagnostic line (surfaced through run events). */
  log(message: string, data?: unknown): void;
}

/**
 * A tool the model may call.
 *
 * `kind: "tool"` blocks the run until the result is available.
 * `kind: "asyncTool"` returns a `started` result immediately and delivers the
 * real result later, so the model can keep working while it runs.
 */
export interface Tool<A = unknown, R = unknown> {
  readonly kind: "tool" | "asyncTool";
  readonly name: string;
  readonly description: string;
  readonly args: z.ZodType<A>;
  readonly result?: z.ZodType<R>;
  execute(args: A, ctx: ToolContext): MaybePromise<R>;
}

export interface ToolDefinition<A, R> {
  name: string;
  description: string;
  args: z.ZodType<A>;
  result?: z.ZodType<R>;
  execute(args: A, ctx: ToolContext): MaybePromise<R>;
}

/** Define a blocking tool. */
export function tool<A, R = unknown>(definition: ToolDefinition<A, R>): Tool<A, R> {
  return { kind: "tool", ...definition };
}

/** Define a non-blocking tool. */
export function asyncTool<A, R = unknown>(
  definition: ToolDefinition<A, R>,
): Tool<A, R> {
  return { kind: "asyncTool", ...definition };
}

/** Narrow any tool to a map-friendly type. */
export type AnyTool = Tool<any, any>;
