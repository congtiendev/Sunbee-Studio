import { net, protocol } from "electron";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DIST_DIR = join(import.meta.dirname, "../../dist");

export function registerAppProtocolPrivileges() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function registerAppProtocolHandler() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const hasExt = extname(url.pathname) !== "";
    const relPath = hasExt ? url.pathname : "/index.html";
    return net.fetch(pathToFileURL(join(DIST_DIR, relPath)).toString());
  });
}
