import { z } from "zod";
import type { AnyTool } from "./tool.js";

export interface PromptContribution {
  name: string;
  content: string;
}

export interface BuildSystemPromptOptions {
  system?: string | undefined;
  context?: string | undefined;
  tools: AnyTool[];
  contributions: PromptContribution[];
}

function toolSchema(tool: AnyTool): string {
  try {
    return JSON.stringify(z.toJSONSchema(tool.args), null, 2);
  } catch {
    return "{}";
  }
}

const PROTOCOL = `## How to respond

You are operating inside a single \`run\`. Accomplish the goal and then stop.

Every response MUST be a single JSON object with this shape and nothing else:

{
  "thinking": "optional short reasoning",
  "toolCalls": [
    { "name": "tool_name", "args": { }, "reason": "optional why" }
  ],
  "result": "final answer, present only when the goal is complete"
}

Rules:
- To use tools, fill \`toolCalls\` (it may contain several calls at once).
- An async tool returns \`status="started"\` immediately. Its real result arrives
  later as a separate \`<tool_result status="success|failed">\` entry. Keep working
  in the meantime.
- If you are waiting for async tool results, respond with \`"toolCalls": []\`.
- Set \`result\` (and no tool calls) ONLY when the goal is complete. This ends the run.
- Never wrap the JSON in prose, and never emit more than one JSON object.
- \`args\` must match the tool's JSON schema.`;

/** Assemble the system prompt from tools, contributions and the protocol. */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const sections: string[] = [];

  sections.push(
    [
      "# kai",
      "",
      "You are `kai`, an autonomous agent. You are given one goal and work until it is done.",
      "Prefer acting with tools over asking questions.",
    ].join("\n"),
  );

  if (options.system && options.system.trim().length > 0) {
    sections.push(`# Instructions\n\n${options.system.trim()}`);
  }

  sections.push(PROTOCOL);

  if (options.tools.length > 0) {
    const tools = options.tools
      .map(
        (tool) =>
          `### ${tool.name}${tool.kind === "asyncTool" ? " (async)" : ""}\n\n${
            tool.description
          }\n\nInput JSON schema:\n\n\`\`\`json\n${toolSchema(tool)}\n\`\`\``,
      )
      .join("\n\n");
    sections.push(`# Tools\n\n${tools}`);
  } else {
    sections.push("# Tools\n\nNo tools are available.");
  }

  if (options.contributions.length > 0) {
    const contributions = options.contributions
      .map((item) => `## ${item.name}\n\n${item.content}`)
      .join("\n\n");
    sections.push(`# Context\n\n${contributions}`);
  }

  if (options.context && options.context.trim().length > 0) {
    sections.push(`# Additional context\n\n${options.context.trim()}`);
  }

  return sections.join("\n\n");
}
