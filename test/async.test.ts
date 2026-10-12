import { describe, expect, it } from "vitest";
import { z } from "zod";
import { asyncTool, kai, type KaiEvent } from "../src/index.js";
import { delay, scriptedProvider } from "./helpers.js";

describe("async tools", () => {
  it("returns `started` immediately and delivers the result later", async () => {
    const slow = asyncTool({
      name: "slow",
      description: "Resolve after a delay.",
      args: z.object({}),
      result: z.string(),
      execute: async () => {
        await delay(20);
        return "finished";
      },
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "slow", args: {} }] },
      { toolCalls: [] }, // waiting for the async result
      { result: "ok" },
    ]);

    const app = kai({ provider, tools: [slow] });
    const run = await app.run("use the slow tool");

    expect(run.result).toBe("ok");
    expect(run.toolResults).toEqual([
      expect.objectContaining({ name: "slow", status: "started" }),
      expect.objectContaining({ name: "slow", status: "success", value: "finished" }),
    ]);
  });

  it("does not block the model while the async tool runs", async () => {
    const events: KaiEvent[] = [];
    let started: number | undefined;
    let finished: number | undefined;

    const slow = asyncTool({
      name: "slow",
      description: "Resolve after a delay.",
      args: z.object({}),
      execute: async () => {
        await delay(20);
        return "done";
      },
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "slow", args: {} }] },
      { toolCalls: [] },
      { result: "ok" },
    ]);

    const app = kai({
      provider,
      tools: [slow],
      onEvent: (event) => {
        events.push(event);
        if (event.type === "tool:result" && event.result.status === "started") {
          started = events.indexOf(event);
        }
        if (event.type === "tool:result" && event.result.status === "success") {
          finished = events.indexOf(event);
        }
      },
    });

    await app.run("goal");

    const secondTurn = events.findIndex((e) => e.type === "turn" && e.turn === 2);
    expect(secondTurn).toBeGreaterThan(-1);
    expect(started).toBeLessThan(secondTurn);
    expect(finished).toBeGreaterThan(secondTurn);
  });

  it("reports an async tool failure as a failed result", async () => {
    const boom = asyncTool({
      name: "boom",
      description: "Always fails.",
      args: z.object({}),
      execute: async () => {
        await delay(5);
        throw new Error("kaboom");
      },
    });

    const provider = scriptedProvider([
      { toolCalls: [{ name: "boom", args: {} }] },
      { toolCalls: [] },
      { result: "recovered" },
    ]);

    const app = kai({ provider, tools: [boom] });
    const run = await app.run("goal");

    expect(run.toolResults).toContainEqual(
      expect.objectContaining({ name: "boom", status: "failed", error: "kaboom" }),
    );
    expect(run.result).toBe("recovered");
  });
});
