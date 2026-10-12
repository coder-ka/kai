export { kai, type Kai, type KaiOptions } from "./kai.js";

export {
  asyncTool,
  tool,
  type AnyTool,
  type Tool,
  type ToolContext,
  type ToolDefinition,
} from "./tool.js";

export {
  contribution,
  type Contribution,
  type ContributionContext,
} from "./contribution.js";

export {
  executeRun,
  type ResolvedKaiOptions,
  type RunOptions,
  type RunResult,
} from "./run.js";

export {
  parseAssistantOutput,
  renderMessages,
  renderToolResult,
  serializeAssistantOutput,
  type AssistantOutput,
  type ChatMessage,
  type Message,
  type ToolCall,
  type ToolResult,
} from "./protocol.js";

export type { KaiEvent, KaiEventHandler } from "./events.js";
export type { CompleteRequest, Provider } from "./provider.js";
export type { MaybePromise } from "./types.js";

export { openAICompatible } from "./provider-openai.js";
export type { OpenAICompatibleProviderOptions } from "./provider-openai.js";

export { openCodeGo } from "./provider-opencode.js";
export type { OpenCodeGoProviderOptions } from "./provider-opencode.js";

export { execTool, fsTools, listFilesTool, readFileTool, writeFileTool } from "./tools.js";

export { isWithin, resolveWithin } from "./path.js";
export { AbortedError, KaiError, ProtocolError, ToolError, toError } from "./errors.js";
