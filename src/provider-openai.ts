import { KaiError } from "./errors.js";
import type { CompleteRequest, Provider } from "./provider.js";

export interface OpenAICompatibleProviderOptions {
  /** Base URL, e.g. `https://api.openai.com/v1`. */
  baseURL: string;
  apiKey: string;
  /** Default model used when a run does not override it. */
  model: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Injectable fetch implementation (useful for tests). */
  fetch?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

/**
 * A provider for any OpenAI-compatible `/chat/completions` endpoint.
 *
 * Implemented with `fetch` so kai itself has no SDK dependency.
 */
export function openAICompatible(
  options: OpenAICompatibleProviderOptions,
): Provider {
  const doFetch = options.fetch ?? globalThis.fetch;
  const baseURL = options.baseURL.replace(/\/+$/, "");

  return {
    name: "openai-compatible",
    async complete(request: CompleteRequest): Promise<string> {
      const body = {
        model: request.model ?? options.model,
        messages: [
          { role: "system", content: request.system },
          ...request.messages,
        ],
        ...(request.responseFormat === "json"
          ? { response_format: { type: "json_object" } }
          : {}),
      };

      let response: Response;
      try {
        response = await doFetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
            ...options.headers,
          },
          body: JSON.stringify(body),
          ...(request.signal ? { signal: request.signal } : {}),
        });
      } catch (error) {
        throw new KaiError(
          `request to ${baseURL} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }

      const text = await response.text();
      let payload: ChatCompletionResponse;
      try {
        payload = JSON.parse(text) as ChatCompletionResponse;
      } catch {
        throw new KaiError(
          `provider returned non-JSON response (${response.status}): ${text.slice(0, 500)}`,
        );
      }

      if (!response.ok) {
        throw new KaiError(
          `provider returned ${response.status}: ${
            payload.error?.message ?? text.slice(0, 500)
          }`,
        );
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new KaiError("provider response did not contain message content");
      }
      return content;
    },
  };
}
