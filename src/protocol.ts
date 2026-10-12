import type { Tool, ToolContext } from "./tool.js";

/** A tool call emitted by the model. `id` is assigned by kai. */
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  reason?: string;
}

export type ToolResult =
  | { id: string; name: string; status: "started" }
  | { id: string; name: string; status: "success"; value: unknown }
  | { id: string; name: string; status: "failed"; error: string };

/** Canonical conversation entry owned by kai. */
export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "tool"; result: ToolResult };

export interface AssistantOutput {
  thinking?: string;
  toolCalls: ToolCall[];
  result?: string;
}

/** Raw shape the model is asked to produce. */
interface RawAssistantOutput {
  thinking?: unknown;
  toolCalls?: unknown;
  result?: unknown;
}

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

function extractJson(text: string): string {
  const fenced = FENCE.exec(text);
  if (fenced?.[1]) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("response does not contain a JSON object");
  }
  return text.slice(start, end + 1);
}

/**
 * Parse the structured output protocol.
 *
 * The model is asked to answer with a JSON object. Tool call ids are assigned
 * here so that the assistant message echoed back to the model already contains
 * them (async results reference these ids).
 */
export function parseAssistantOutput(
  text: string,
  makeId: (index: number) => string,
): AssistantOutput {
  let raw: RawAssistantOutput;
  try {
    raw = JSON.parse(extractJson(text)) as RawAssistantOutput;
  } catch (error) {
    throw new Error(
      `failed to parse assistant response as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (raw === null || typeof raw !== "object") {
    throw new Error("assistant response must be a JSON object");
  }

  const toolCalls: ToolCall[] = [];
  if (raw.toolCalls !== undefined) {
    if (!Array.isArray(raw.toolCalls)) {
      throw new Error("`toolCalls` must be an array");
    }
    raw.toolCalls.forEach((entry, index) => {
      if (entry === null || typeof entry !== "object") {
        throw new Error(`toolCalls[${index}] must be an object`);
      }
      const call = entry as Record<string, unknown>;
      if (typeof call.name !== "string" || call.name.length === 0) {
        throw new Error(`toolCalls[${index}].name must be a non-empty string`);
      }
      toolCalls.push({
        id: makeId(index),
        name: call.name,
        args: call.args ?? {},
        ...(typeof call.reason === "string" ? { reason: call.reason } : {}),
      });
    });
  }

  const result: AssistantOutput = { toolCalls };
  if (typeof raw.thinking === "string" && raw.thinking.length > 0) {
    result.thinking = raw.thinking;
  }
  if (raw.result !== undefined) {
    if (typeof raw.result !== "string") {
      throw new Error("`result` must be a string when present");
    }
    result.result = raw.result;
  }
  return result;
}

/** Serialize an assistant output back into the canonical message content. */
export function serializeAssistantOutput(output: AssistantOutput): string {
  return JSON.stringify({
    ...(output.thinking !== undefined ? { thinking: output.thinking } : {}),
    toolCalls: output.toolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
      ...(call.reason !== undefined ? { reason: call.reason } : {}),
    })),
    ...(output.result !== undefined ? { result: output.result } : {}),
  });
}

export function renderToolResult(result: ToolResult): string {
  switch (result.status) {
    case "started":
      return `<tool_result id="${result.id}" name="${result.name}" status="started" />`;
    case "success":
      return `<tool_result id="${result.id}" name="${result.name}" status="success">\n${JSON.stringify(
        result.value,
        null,
        2,
      )}\n</tool_result>`;
    case "failed":
      return `<tool_result id="${result.id}" name="${result.name}" status="failed">\n${result.error}\n</tool_result>`;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Render canonical messages into provider-agnostic chat messages. */
export function renderMessages(messages: Message[]): ChatMessage[] {
  return messages.map((message): ChatMessage => {
    if (message.role === "tool") {
      return { role: "user", content: renderToolResult(message.result) };
    }
    return { role: message.role, content: message.content };
  });
}

export type { Tool, ToolContext };
