import path from "node:path";

export const PORT = Number(process.env.SUNBEE_PORT ?? 4317);

export function dataDir(): string {
  return process.env.SUNBEE_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function staticDir(): string {
  return process.env.SUNBEE_STATIC_DIR ?? path.join(process.cwd(), "dist");
}
