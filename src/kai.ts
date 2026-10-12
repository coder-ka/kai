import type { Contribution } from "./contribution.js";
import { KaiError } from "./errors.js";
import type { KaiEventHandler } from "./events.js";
import type { Provider } from "./provider.js";
import {
  executeRun,
  type ResolvedKaiOptions,
  type RunOptions,
  type RunResult,
} from "./run.js";
import type { AnyTool } from "./tool.js";

export interface KaiOptions {
  /** The language model backend. */
  provider: Provider;
  /** Tools the model may call. */
  tools?: AnyTool[];
  /** Context providers that persist across runs. */
  contributions?: Contribution[];
  /** Default model name, overridable per run. */
  model?: string;
  /** Extra system instructions. */
  system?: string;
  /** Working directory for tools. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Maximum model turns per run. Defaults to 50. */
  maxTurns?: number;
  /** Ask the provider for JSON responses. Defaults to `"json"`. */
  responseFormat?: "text" | "json";
  /** Global event listener. */
  onEvent?: KaiEventHandler;
}

export interface Kai {
  readonly tools: readonly AnyTool[];
  readonly contributions: readonly Contribution[];
  /** Execute a single run toward `goal`. */
  run(goal: string, options?: Omit<RunOptions, "goal">): Promise<RunResult>;
}

/**
 * Create a kai harness.
 *
 * kai is a library, not a chat application: you compose tools and
 * contributions and then call `run(goal)`. Each run is a single objective.
 *
 * ```ts
 * const app = kai({
 *   provider: openAICompatible({ baseURL, apiKey, model: "gpt-4o-mini" }),
 *   tools: [readFileTool, execTool],
 * });
 *
 * const { result } = await app.run("Summarize README.md");
 * ```
 */
export function kai(options: KaiOptions): Kai {
  const tools = options.tools ?? [];
  const contributions = options.contributions ?? [];

  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new KaiError(`duplicate tool name: ${tool.name}`);
    }
    seen.add(tool.name);
  }

  const config: ResolvedKaiOptions = {
    provider: options.provider,
    model: options.model,
    tools,
    contributions,
    system: options.system,
    cwd: options.cwd ?? process.cwd(),
    maxTurns: options.maxTurns ?? 50,
    responseFormat: options.responseFormat ?? "json",
    onEvent: options.onEvent,
  };

  return {
    tools,
    contributions,
    run: (goal, runOptions) => executeRun(config, { ...runOptions, goal }),
  };
}
