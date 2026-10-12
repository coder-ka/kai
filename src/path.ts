import path from "node:path";

/** Resolve `target` against `cwd`, refusing paths that escape the directory. */
export function resolveWithin(cwd: string, target: string): string {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`path escapes the working directory: ${target}`);
}

/** True when `target` is `parent` itself or lives underneath it. */
export function isWithin(target: string, parent: string): boolean {
  const root = path.resolve(parent);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
