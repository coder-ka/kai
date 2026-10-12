import { randomUUID } from "node:crypto";
import type { Provider } from "./provider.js";
import {
  openAICompatible,
  type OpenAICompatibleProviderOptions,
} from "./provider-openai.js";

export interface OpenCodeGoProviderOptions {
  apiKey: string;
  model: string;
  /** Defaults to `https://opencode.ai/zen/go/v1`. */
  baseURL?: string;
  /**
   * Routing hint sent as `x-opencode-session`. OpenCode Go rejects requests
   * without it. Defaults to a random id per provider instance.
   */
  session?: string;
  /** Client name sent as `x-opencode-client`. Defaults to `"kai"`. */
  client?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

/**
 * A provider for OpenCode Go (`https://opencode.ai/zen/go`).
 *
 * OpenCode Go speaks the OpenAI `/chat/completions` wire format, but requires
 * an `x-opencode-session` header for routing. This wraps `openAICompatible`
 * and fills that in.
 */
export function openCodeGo(options: OpenCodeGoProviderOptions): Provider {
  const headers: Record<string, string> = {
    "x-opencode-session": options.session ?? randomUUID(),
    "x-opencode-client": options.client ?? "kai",
    ...options.headers,
  };

  const compatible: OpenAICompatibleProviderOptions = {
    baseURL: options.baseURL ?? "https://opencode.ai/zen/go/v1",
    apiKey: options.apiKey,
    model: options.model,
    headers,
  };
  if (options.fetch) compatible.fetch = options.fetch;

  return openAICompatible(compatible);
}
