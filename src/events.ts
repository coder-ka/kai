import type { ToolCall, ToolResult } from "./protocol.js";

export type KaiEvent =
  | { type: "run:start"; runId: string; goal: string; cwd: string }
  | { type: "run:end"; runId: string; result: string; turns: number }
  | { type: "run:error"; runId: string; error: Error }
  | { type: "turn"; runId: string; turn: number }
  | {
      type: "assistant";
      runId: string;
      content: string;
      toolCalls: ToolCall[];
      result?: string;
    }
  | { type: "tool:call"; runId: string; call: ToolCall; mode: "tool" | "asyncTool" }
  | { type: "tool:result"; runId: string; result: ToolResult }
  | { type: "contribution:start"; runId: string; name: string }
  | { type: "contribution:update"; runId: string; name: string }
  | { type: "log"; runId: string; message: string; data?: unknown };

export type KaiEventHandler = (event: KaiEvent) => void;
