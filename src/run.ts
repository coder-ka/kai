import type { Contribution, ContributionContext } from "./contribution.js";
import type { KaiEvent, KaiEventHandler } from "./events.js";
import { KaiError, ProtocolError, ToolError, toError } from "./errors.js";
import { randomId } from "./id.js";
import { buildSystemPrompt } from "./prompt.js";
import type { Provider } from "./provider.js";
import {
  parseAssistantOutput,
  renderMessages,
  serializeAssistantOutput,
  type AssistantOutput,
  type Message,
  type ToolCall,
  type ToolResult,
} from "./protocol.js";
import type { AnyTool, ToolContext } from "./tool.js";

export interface RunOptions {
  goal: string;
  /** Override the run id (mainly for deterministic tests). */
  runId?: string;
  /** Override the model for this run. */
  model?: string;
  /** Override the working directory for this run. */
  cwd?: string;
  /** Override the maximum number of model turns. */
  maxTurns?: number;
  /** Cancel the run. */
  signal?: AbortSignal;
  /** Per-run event listener (in addition to the kai-level listener). */
  onEvent?: KaiEventHandler;
  /** Extra system context used only for this run. */
  context?: string;
}

export interface RunResult {
  runId: string;
  goal: string;
  result: string;
  turns: number;
  messages: Message[];
  toolResults: ToolResult[];
}

/** Fully resolved configuration consumed by the run loop. */
export interface ResolvedKaiOptions {
  provider: Provider;
  model?: string | undefined;
  tools: AnyTool[];
  contributions: Contribution[];
  system?: string | undefined;
  cwd: string;
  maxTurns: number;
  responseFormat?: "text" | "json" | undefined;
  onEvent?: KaiEventHandler | undefined;
}

/**
 * The run loop.
 *
 * Sync tools block and their result is appended immediately. Async tools emit a
 * `started` result right away and deliver the real result whenever it is ready;
 * the model can therefore keep issuing work instead of waiting.
 */
export async function executeRun(
  config: ResolvedKaiOptions,
  options: RunOptions,
): Promise<RunResult> {
  const runId = options.runId ?? randomId("run");
  const cwd = options.cwd ?? config.cwd;
  const maxTurns = options.maxTurns ?? config.maxTurns;

  const emit = (event: KaiEvent): void => {
    try {
      config.onEvent?.(event);
    } finally {
      options.onEvent?.(event);
    }
  };

  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  const messages: Message[] = [{ role: "user", content: options.goal }];
  const toolResults: ToolResult[] = [];
  const pending = new Map<string, Promise<void>>();

  const toolContext: ToolContext = {
    cwd,
    runId,
    signal,
    log: (message, data) => emit({ type: "log", runId, message, data }),
  };

  const settle = (result: ToolResult): void => {
    pending.delete(result.id);
    messages.push({ role: "tool", result });
    toolResults.push(result);
    emit({ type: "tool:result", runId, result });
  };

  const waitForPending = async (): Promise<void> => {
    if (pending.size === 0) return;
    await Promise.race([...pending.values()]);
  };

  const handleToolCall = async (call: ToolCall): Promise<void> => {
    const definition = config.tools.find((tool) => tool.name === call.name);
    emit({
      type: "tool:call",
      runId,
      call,
      mode: definition?.kind ?? "tool",
    });

    if (!definition) {
      settle({
        id: call.id,
        name: call.name,
        status: "failed",
        error: `unknown tool: ${call.name}`,
      });
      return;
    }

    const parsed = definition.args.safeParse(call.args ?? {});
    if (!parsed.success) {
      settle({
        id: call.id,
        name: call.name,
        status: "failed",
        error: `invalid arguments for ${call.name}: ${parsed.error.message}`,
      });
      return;
    }

    const run = async (): Promise<void> => {
      try {
        const value = await definition.execute(parsed.data, toolContext);
        if (definition.result) {
          const checked = definition.result.safeParse(value);
          if (!checked.success) {
            throw new ToolError(
              `tool ${call.name} returned an invalid result: ${checked.error.message}`,
            );
          }
          settle({
            id: call.id,
            name: call.name,
            status: "success",
            value: checked.data,
          });
        } else {
          settle({ id: call.id, name: call.name, status: "success", value });
        }
      } catch (error) {
        settle({
          id: call.id,
          name: call.name,
          status: "failed",
          error: toError(error).message,
        });
      }
    };

    if (definition.kind === "asyncTool") {
      settle({ id: call.id, name: call.name, status: "started" });
      const promise = run();
      pending.set(call.id, promise);
    } else {
      await run();
    }
  };

  const contributionContext = (name: string): ContributionContext => ({
    name,
    cwd,
    signal,
    complete: (request) => config.provider.complete({ ...request, signal }),
    log: (message, data) => emit({ type: "log", runId, message, data }),
  });

  const loadedContributions: Array<Contribution> = [];
  const contributionContents: Array<{ name: string; content: string }> = [];

  emit({ type: "run:start", runId, goal: options.goal, cwd });

  try {
    for (const item of config.contributions) {
      const ctx = contributionContext(item.name);
      emit({ type: "contribution:start", runId, name: item.name });
      await item.onStart?.(ctx);
      loadedContributions.push(item);

      let content = await item.load?.(ctx);

      if (item.test && (await item.test(ctx, content))) {
        emit({ type: "contribution:update", runId, name: item.name });
        const next = await item.update?.(ctx, content);
        if (next !== undefined) {
          content = next;
        }
      }

      if (content !== undefined && content.trim().length > 0) {
        contributionContents.push({ name: item.name, content });
      }
    }

    const system = buildSystemPrompt({
      system: config.system,
      context: options.context,
      tools: config.tools,
      contributions: contributionContents,
    });

    let turns = 0;
    let result: string | undefined;

    while (true) {
      turns += 1;
      if (turns > maxTurns) {
        throw new KaiError(
          `maximum number of turns (${maxTurns}) exceeded before the goal was reached`,
        );
      }
      emit({ type: "turn", runId, turn: turns });

      const model = options.model ?? config.model;
      const raw = await config.provider.complete({
        ...(model !== undefined ? { model } : {}),
        system,
        messages: renderMessages(messages),
        signal,
        ...(config.responseFormat ? { responseFormat: config.responseFormat } : {}),
      });

      let output: AssistantOutput;
      try {
        output = parseAssistantOutput(raw, () => randomId("call"));
      } catch (error) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: `Your previous response could not be parsed. Error: ${
            error instanceof Error ? error.message : String(error)
          }\nRespond again with a single valid JSON object.`,
        });
        continue;
      }

      messages.push({ role: "assistant", content: serializeAssistantOutput(output) });
      emit({
        type: "assistant",
        runId,
        content: serializeAssistantOutput(output),
        toolCalls: output.toolCalls,
        ...(output.result !== undefined ? { result: output.result } : {}),
      });

      if (output.toolCalls.length > 0) {
        for (const call of output.toolCalls) {
          await handleToolCall(call);
        }
        continue;
      }

      if (pending.size > 0) {
        await waitForPending();
        continue;
      }

      if (output.result !== undefined) {
        result = output.result;
        break;
      }

      throw new ProtocolError(
        "model produced neither tool calls nor a result; cannot make progress",
      );
    }

    emit({ type: "run:end", runId, result, turns });
    return {
      runId,
      goal: options.goal,
      result,
      turns,
      messages,
      toolResults,
    };
  } catch (error) {
    const err = toError(error);
    emit({ type: "run:error", runId, error: err });
    throw err;
  } finally {
    for (const item of loadedContributions.reverse()) {
      try {
        await item.onEnd?.(contributionContext(item.name));
      } catch (error) {
        emit({
          type: "log",
          runId,
          message: `contribution ${item.name} onEnd failed`,
          data: toError(error).message,
        });
      }
    }
  }
}
