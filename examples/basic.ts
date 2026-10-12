import { fsTools, kai, openAICompatible } from "../src/index.js";

const app = kai({
  provider: openAICompatible({
    baseURL: "https://api.openai.com/v1",
    apiKey: "sk-...",
    model: "gpt-4o-mini",
  }),
  tools: fsTools(),
  cwd: process.cwd(),
  system: "You work inside a TypeScript monorepo. Be concise.",
  onEvent: (event) => {
    switch (event.type) {
      case "assistant":
        for (const call of event.toolCalls) {
          console.log(`  -> ${call.name} ${JSON.stringify(call.args)}`);
        }
        if (event.result !== undefined) console.log(`  = ${event.result}`);
        break;
      case "tool:result":
        console.log(`  <- ${event.result.name} [${event.result.status}]`);
        break;
      default:
        break;
    }
  },
});

const goal =
  process.argv.slice(2).join(" ") ||
  "List the files here and summarize what this project is.";

const run = await app.run(goal);
console.log(`\nResult (${run.turns} turns):\n${run.result}`);
