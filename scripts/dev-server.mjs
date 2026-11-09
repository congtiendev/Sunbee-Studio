// Runs the API server under `tsx watch` with stdin detached.
//
// `tsx watch` never starts the server when its stdin is an open pipe — which is exactly
// what `concurrently` hands its children — so `npm run dev` / `npm run dev:electron`
// would hang silently with nothing listening on SUNBEE_PORT. Detaching stdin avoids
// that; the only thing lost is tsx's "press Enter to restart" shortcut.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tsxPkgPath = require.resolve("tsx/package.json");
const tsxCli = path.join(path.dirname(tsxPkgPath), require(tsxPkgPath).bin);

const child = spawn(process.execPath, [tsxCli, "watch", "server/index.ts"], {
  stdio: ["ignore", "inherit", "inherit"],
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
