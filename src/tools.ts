import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { resolveWithin } from "./path.js";
import { asyncTool, tool, type AnyTool } from "./tool.js";

export const readFileTool = tool({
  name: "read_file",
  description: "Read a UTF-8 text file from the working directory.",
  args: z.object({
    path: z.string().describe("File path relative to the working directory"),
  }),
  result: z.string(),
  async execute({ path }, ctx) {
    return readFile(resolveWithin(ctx.cwd, path), "utf8");
  },
});

export const listFilesTool = tool({
  name: "list_files",
  description: "List entries of a directory. Directory names end with `/`.",
  args: z.object({
    path: z
      .string()
      .default(".")
      .describe("Directory path relative to the working directory"),
  }),
  result: z.array(z.string()),
  async execute({ path }, ctx) {
    const entries = await readdir(resolveWithin(ctx.cwd, path), {
      withFileTypes: true,
    });
    return entries
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort();
  },
});

export const writeFileTool = tool({
  name: "write_file",
  description: "Write a UTF-8 text file, creating parent directories as needed.",
  args: z.object({
    path: z.string().describe("File path relative to the working directory"),
    content: z.string().describe("Full file content"),
  }),
  result: z.object({ bytes: z.number() }),
  async execute({ path, content }, ctx) {
    const target = resolveWithin(ctx.cwd, path);
    await writeFile(target, content, "utf8");
    return { bytes: Buffer.byteLength(content, "utf8") };
  },
});

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run a shell command. Defined as an async tool so a long-running command does
 * not block the model from doing other work.
 */
export const execTool = asyncTool({
  name: "exec",
  description:
    "Run a shell command in the working directory. Long-running, so it returns immediately and reports the output later.",
  args: z.object({
    command: z.string().describe("Shell command to execute"),
    cwd: z.string().optional().describe("Directory relative to the working directory"),
  }),
  result: z.object({
    code: z.number().nullable(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  execute({ command, cwd }, ctx): Promise<ExecResult> {
    const workdir = resolveWithin(ctx.cwd, cwd ?? ".");
    return new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(command, {
        cwd: workdir,
        shell: true,
        signal: ctx.signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  },
});

/** A small, safe-by-default tool set for file and shell work. */
export function fsTools(): AnyTool[] {
  return [readFileTool, listFilesTool, writeFileTool, execTool];
}
