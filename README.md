# kai

A tiny, single-run AI harness for TypeScript. Compose tools, async tools and
contributions, then call `run(goal)`. No chat loop, no framework, no SDK lock-in.

```ts
const app = kai({
  provider: openAICompatible({ baseURL, apiKey, model: "gpt-4o-mini" }),
  tools: [readFileTool, execTool],
});

const { result } = await app.run("Summarize README.md");
```

## Install

```bash
npm install kai
# or
pnpm add kai
```

## Quick start

```ts
import {
  fsTools,
  kai,
  openAICompatible,
  tool,
  asyncTool,
} from "kai";
import { z } from "zod";

// A blocking tool: the run waits for its return value.
const add = tool({
  name: "add",
  description: "Add two numbers.",
  args: z.object({ a: z.number(), b: z.number() }),
  execute: ({ a, b }) => a + b,
});

// A non-blocking tool: kai returns "started" and keeps going.
const deploy = asyncTool({
  name: "deploy",
  description: "Deploy the app and report when it is live.",
  args: z.object({ env: z.enum(["staging", "production"]) }),
  execute: async ({ env }, ctx) => {
    return await deploySomewhere(env, { signal: ctx.signal });
  },
});

const app = kai({
  provider: openAICompatible({
    baseURL: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  }),
  tools: [add, deploy, ...fsTools()],
});

const run = await app.run("Deploy to staging and tell me the URL.");
console.log(run.result);
```

## Core concepts

### Runs

`app.run(goal, options?)` runs until the model produces a `result` (or throws).
There is no user turn in the middle. Everything the model needs must come from
the system prompt, the tools, and contributions.

```ts
const run = await app.run("Fix the failing test in src/math.test.ts", {
  model: "gpt-4o",
  maxTurns: 30,
  cwd: process.cwd(),
  signal: AbortSignal.timeout(60_000),
  onEvent: (event) => console.log(event.type),
});

run.result;      // the final answer
run.turns;       // how many model turns it took
run.messages;    // the full canonical transcript
run.toolResults; // every tool result, including `started` ones
```

### Tools

Tools are declared with [Zod](https://zod.dev) schemas. kai turns the schema
into JSON Schema for the prompt and validates the model's arguments before
calling your function. A throwing tool becomes a `failed` result instead of
crashing the run.

```ts
import { tool } from "kai";
import { z } from "zod";

const search = tool({
  name: "search",
  description: "Search the codebase for a string.",
  args: z.object({ query: z.string(), limit: z.number().default(10) }),
  result: z.array(z.string()), // optional result validation
  execute: async ({ query, limit }, ctx) => {
    ctx.log("searching", { query });
    return searchCode(ctx.cwd, query, limit);
  },
});
```

`ctx` gives you `cwd`, `runId`, an abort `signal`, and `log()`.

### Async tools

This is the part kai was built for. Instead of blocking on a long tool, the
model gets a `started` acknowledgement and moves on:

```
model:  calls deploy({ env: "staging" })
kai:    tool_result deploy status="started"      <-- immediate

model:  writes the changelog, runs the tests, ...

later:  tool_result deploy status="success"      <-- delivered when ready
        { "url": "https://staging.example.com" }
```

The transcript stays single-threaded and ordered; results simply arrive as
follow-up messages. If the model has nothing to do while waiting it responds
with an empty `toolCalls` array and kai waits for the next result.

```ts
const migrate = asyncTool({
  name: "migrate",
  description: "Run database migrations (may take a while).",
  args: z.object({}),
  execute: async (_args, ctx) => runMigrations(ctx.signal),
});
```

### Contributions

A contribution is context the model maintains for itself. kai calls `load` to
get the current content, `test` to decide whether it is stale, and `update` to
regenerate it. The returned value is injected into the system prompt.

Persistence is entirely up to the contribution — kai has no storage layer. If
`update` writes a file and `load` reads it back, the contribution survives
across runs. If it only lives in memory, it lasts for one run.

```ts
import { readFile, writeFile } from "node:fs/promises";
import { contribution } from "kai";

const projectNotes = contribution({
  name: "project-notes",

  async load() {
    try {
      return await readFile(".kai/notes.md", "utf8");
    } catch {
      return undefined;
    }
  },

  // Refresh when we have never seen the notes.
  test: (_ctx, content) => content === undefined,

  async update(ctx) {
    const notes = await ctx.complete({
      system: "You maintain concise project notes for an AI agent.",
      messages: [{ role: "user", content: "Write the project notes." }],
      responseFormat: "text",
    });
    await writeFile(".kai/notes.md", notes, "utf8");
    return notes;
  },

  onStart: () => console.log("run starting"),
  onEnd: () => console.log("run finished"),
});
```

Because `test` can return `true` on any condition, you can also use a
contribution to make a one-time LLM decision permanent — for example, let the
model figure out how to start a dev server once, persist the command, and from
then on replay it deterministically.

### Events

Pass `onEvent` to `kai()` or to a single `run()` to observe what is happening.
This is how you build a UI or a log on top of kai.

| Event                                       | When                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `run:start`, `run:end`, `run:error`         | run lifecycle                                           |
| `turn`                                      | before each model call                                  |
| `assistant`                                 | a parsed model response (with tool calls and/or result) |
| `tool:call`                                 | a tool is about to run                                  |
| `tool:result`                               | a `started`, `success` or `failed` result               |
| `contribution:start`, `contribution:update` | contribution lifecycle                                  |
| `log`                                       | `ctx.log()` from tools and contributions                |

## Providers

A provider is one method: turn a system prompt plus messages into text.

```ts
interface Provider {
  readonly name: string;
  complete(request: CompleteRequest): Promise<string>;
}
```

`openAICompatible()` is included and uses `fetch`, so kai core has a single
dependency (`zod`). Implement the interface to plug in anything else — a local
model, a mock, or a different wire format.

### OpenCode Go

`openCodeGo()` wraps `openAICompatible` for
[OpenCode Go](https://opencode.ai/docs/go/) (`https://opencode.ai/zen/go`).
OpenCode Go speaks the OpenAI `/chat/completions` format but requires an
`x-opencode-session` header for routing — the helper fills it in.

```ts
import { kai, openCodeGo } from "kai";

const app = kai({
  provider: openCodeGo({
    apiKey: process.env.OPENCODE_API_KEY!,
    model: "kimi-k2.6",
  }),
});
```

## Built-in tools

`fsTools()` returns a small, cwd-scoped set:

| Tool         | Kind      | Description         |
| ------------ | --------- | ------------------- |
| `read_file`  | sync      | read a UTF-8 file   |
| `list_files` | sync      | list a directory    |
| `write_file` | sync      | write a file        |
| `exec`       | **async** | run a shell command |

All paths are resolved against the run's `cwd` and rejected if they escape it.

## Design notes

- **One run, one goal.** No chat state machine, no hidden user turns.
- **The transcript is the only state.** Sync and async results both append to
  one ordered message list; there are no side channels.
- **Small surface.** `kai`, `run`, `tool`, `asyncTool`, `contribution`,
  `Provider`.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
