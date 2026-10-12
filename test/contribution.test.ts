import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contribution, kai, type ContributionContext } from "../src/index.js";
import { scriptedProvider, type Capture } from "./helpers.js";

describe("contributions", () => {
  it("runs onStart, load, test, update and onEnd in order", async () => {
    const order: string[] = [];

    const notes = contribution({
      name: "notes",
      onStart: () => {
        order.push("onStart");
      },
      load: () => {
        order.push("load");
        return undefined;
      },
      test: () => {
        order.push("test");
        return true;
      },
      update: () => {
        order.push("update");
        return "fresh content";
      },
      onEnd: () => {
        order.push("onEnd");
      },
    });

    const capture: Capture = { systems: [], messages: [] };
    const provider = scriptedProvider([{ result: "done" }], capture);
    const app = kai({ provider, contributions: [notes] });

    await app.run("goal");

    expect(order).toEqual(["onStart", "load", "test", "update", "onEnd"]);
    expect(capture.systems[0]).toContain("fresh content");
  });

  it("lets the contribution own its persistence across runs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-contribution-"));
    const file = path.join(dir, "notes.md");
    let updates = 0;

    const notes = contribution({
      name: "notes",
      load: async () => {
        try {
          return await readFile(file, "utf8");
        } catch {
          return undefined;
        }
      },
      test: (_ctx: ContributionContext, content) => content === undefined,
      update: async () => {
        updates += 1;
        const value = "persisted context";
        await writeFile(file, value, "utf8");
        return value;
      },
    });

    const first = scriptedProvider([{ result: "one" }]);
    await kai({ provider: first, contributions: [notes] }).run("goal");

    const capture: Capture = { systems: [], messages: [] };
    const second = scriptedProvider([{ result: "two" }], capture);
    await kai({ provider: second, contributions: [notes] }).run("goal");

    expect(updates).toBe(1);
    expect(await readFile(file, "utf8")).toBe("persisted context");
    // The second run loaded from disk, so the content is still injected.
    expect(capture.systems[0]).toContain("persisted context");
  });

  it("does not inject empty contributions", async () => {
    const empty = contribution({ name: "empty", load: () => "   " });
    const capture: Capture = { systems: [], messages: [] };
    const provider = scriptedProvider([{ result: "done" }], capture);

    await kai({ provider, contributions: [empty] }).run("goal");
    expect(capture.systems[0]).not.toContain("# Context");
  });

  it("still runs onEnd when the run fails", async () => {
    let ended = false;
    const notes = contribution({
      name: "notes",
      onEnd: () => {
        ended = true;
      },
    });

    const provider = scriptedProvider([]); // exhausts immediately
    const app = kai({ provider, contributions: [notes] });

    await expect(app.run("goal")).rejects.toThrow();
    expect(ended).toBe(true);
  });
});
