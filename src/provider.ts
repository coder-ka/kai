import type { ChatMessage } from "./protocol.js";

export interface CompleteRequest {
  model?: string;
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Ask the provider for a JSON object response when supported. */
  responseFormat?: "text" | "json";
}

/**
 * A minimal language model provider.
 *
 * kai owns the conversation and the structured output protocol; a provider is
 * only responsible for turning a system prompt plus messages into text. This
 * keeps the harness independent from any SDK.
 */
export interface Provider {
  readonly name: string;
  complete(request: CompleteRequest): Promise<string>;
}
