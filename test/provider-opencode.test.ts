import { describe, expect, it } from "vitest";
import { openCodeGo } from "../src/index.js";

/** Capture the request the provider makes. */
function captureFetch(): {
  calls: Array<{ url: string; init: RequestInit }>;
  fetch: typeof fetch;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { calls, fetch: impl };
}

describe("openCodeGo", () => {
  it("posts to the OpenCode Go OpenAI endpoint with routing headers", async () => {
    const { calls, fetch } = captureFetch();
    const provider = openCodeGo({
      apiKey: "oc_sk_test",
      model: "kimi-k2.6",
      session: "session-1",
      fetch,
    });

    const text = await provider.complete({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(text).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://opencode.ai/zen/go/v1/chat/completions",
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toBe("session-1");
    expect(headers["x-opencode-client"]).toBe("kai");
    expect(headers.authorization).toBe("Bearer oc_sk_test");
  });

  it("generates a session id when none is given", async () => {
    const { calls, fetch } = captureFetch();
    const provider = openCodeGo({
      apiKey: "k",
      model: "m",
      fetch,
    });
    await provider.complete({ system: "s", messages: [] });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toBeTruthy();
  });
});
