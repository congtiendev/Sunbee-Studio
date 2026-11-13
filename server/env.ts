import path from "node:path";

export const PORT = Number(process.env.SUNBEE_PORT ?? 4317);

export function dataDir(): string {
  // path.resolve (not just the env var as-is): SUNBEE_DATA_DIR is commonly
  // set to a relative "data" in .env, which stays safe for plain fs calls
  // (always relative to this process's cwd) but breaks the moment anything
  // spawns a child process with a different `cwd` (e.g. the voice engine
  // sidecar) and tries to resolve a path built from it.
  return path.resolve(process.env.SUNBEE_DATA_DIR ?? path.join(process.cwd(), "data"));
}

export function staticDir(): string {
  return path.resolve(process.env.SUNBEE_STATIC_DIR ?? path.join(process.cwd(), "dist"));
}
