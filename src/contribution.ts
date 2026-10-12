import type { CompleteRequest } from "./provider.js";
import type { MaybePromise } from "./types.js";

/**
 * Context handed to a contribution lifecycle hook.
 *
 * kai deliberately provides no storage abstraction: a contribution persists
 * whatever it wants, wherever it wants (a file, a database, ...). The only
 * difference between an ephemeral and a persisted contribution is what its
 * `update` targets.
 */
export interface ContributionContext {
  readonly name: string;
  readonly cwd: string;
  readonly signal: AbortSignal;
  /** Call the underlying model directly (bypassing the tool loop). */
  complete(request: Omit<CompleteRequest, "signal">): Promise<string>;
  log(message: string, data?: unknown): void;
}

/**
 * A contribution lets the model improve its own context across runs.
 *
 * Lifecycle at the start of a run:
 *   1. `onStart` runs.
 *   2. `load` produces the current content.
 *   3. `test` decides whether `update` should run.
 *   4. `update` returns new content (persisting it itself if desired).
 * The resulting content is injected into the system prompt.
 *
 * `onEnd` runs when the run finishes (success or failure).
 */
export interface Contribution {
  readonly name: string;
  load?(ctx: ContributionContext): MaybePromise<string | undefined>;
  test?(
    ctx: ContributionContext,
    content: string | undefined,
  ): MaybePromise<boolean>;
  update?(
    ctx: ContributionContext,
    content: string | undefined,
  ): MaybePromise<string | undefined>;
  onStart?(ctx: ContributionContext): MaybePromise<void>;
  onEnd?(ctx: ContributionContext): MaybePromise<void>;
}

/** Define a contribution. */
export function contribution(definition: Contribution): Contribution {
  return definition;
}
