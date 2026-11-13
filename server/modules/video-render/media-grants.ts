import { randomUUID } from "node:crypto";

/**
 * Remotion's headless browser has no session cookie, so it can't read
 * `/api/files/:id`. Each render instead gets an unguessable token that opens
 * exactly the files its manifest references (already access-checked when the
 * render started), for as long as the render runs.
 */
export interface GrantedFile {
  absolutePath: string;
  mime: string;
}

const grants = new Map<string, ReadonlyMap<string, GrantedFile>>();

export function grantMedia(files: ReadonlyMap<string, GrantedFile>): { token: string; revoke: () => void } {
  const token = randomUUID();
  grants.set(token, files);
  return { token, revoke: () => grants.delete(token) };
}

export function grantedFile(token: string, fileId: string): GrantedFile | null {
  return grants.get(token)?.get(fileId) ?? null;
}
