import { describe, expect, it } from "vitest";
import { z } from "zod";
import { kai, tool, type ToolCall } from "../src/index.js";
import { scriptedProvider } from "./helpers.js";

describe("kai.run", () => {
  it("executes a sync tool and returns the final result", async () => {
    const calls: Array<[number, number]> = [];
    const add = tool({
      name: "add",
      description: "Add two numbers.",
      args: z.object({ a: z.number(), b: z.number() }),
      result: z.number(),
      execute: ({ a, b }) => {
        calls.push([a, b]);
        return a + b;
      },
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "add", args: { a: 1, b: 2 } }] },
      { result: "3" },
    ]);

    const app = kai({ provider, tools: [add] });
    const run = await app.run("add 1 and 2");

    expect(run.result).toBe("3");
    expect(run.turns).toBe(2);
    expect(calls).toEqual([[1, 2]]);
    expect(run.toolResults).toContainEqual(
      expect.objectContaining({ name: "add", status: "success", value: 3 }),
    );
  });

  it("reports unknown tools and invalid args as failed results", async () => {
    const noop = tool({
      name: "noop",
      description: "Do nothing.",
      args: z.object({ value: z.number() }),
      execute: () => "ok",
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "missing", args: {} }] },
      { toolCalls: [{ name: "noop", args: { value: "not-a-number" } }] },
      { result: "done" },
    ]);

    const app = kai({ provider, tools: [noop] });
    const run = await app.run("try bad calls");

    const failed = run.toolResults.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(2);
    expect(failed[0]).toMatchObject({ error: expect.stringContaining("unknown tool") });
    expect(failed[1]).toMatchObject({
      error: expect.stringContaining("invalid arguments"),
    });
    expect(run.result).toBe("done");
  });

  it("recovers from a malformed model response", async () => {
    const provider = scriptedProvider(["sorry, here is no json", { result: "recovered" }]);
    const app = kai({ provider });

    const run = await app.run("goal");
    expect(run.result).toBe("recovered");
    expect(run.turns).toBe(2);
  });

  it("emits tool call ids on the assistant message so results correlate", async () => {
    const calls: ToolCall[] = [];
    const echo = tool({
      name: "echo",
      description: "Echo a value.",
      args: z.object({ value: z.string() }),
      execute: ({ value }) => value,
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "echo", args: { value: "hi" } }] },
      { result: "ok" },
    ]);

    const app = kai({
      provider,
      tools: [echo],
      onEvent: (event) => {
        if (event.type === "assistant") calls.push(...event.toolCalls);
      },
    });

    await app.run("echo");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toMatch(/^call_/);
  });
});
