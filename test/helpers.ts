import type { CompleteRequest, Provider } from "../src/index.js";

export interface Capture {
  systems: string[];
  messages: CompleteRequest["messages"][];
}

/**
 * A provider that replays a fixed script. Objects are serialized to JSON,
 * strings are returned verbatim (to test malformed responses).
 */
export function scriptedProvider(
  outputs: Array<unknown>,
  capture?: Capture,
): Provider {
  let index = 0;
  return {
    name: "scripted",
    async complete(request: CompleteRequest): Promise<string> {
      capture?.systems.push(request.system);
      capture?.messages.push(request.messages);
      if (index >= outputs.length) {
        throw new Error(`scripted provider exhausted after ${index} calls`);
      }
      const output = outputs[index];
      index += 1;
      return typeof output === "string" ? output : JSON.stringify(output);
    },
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
