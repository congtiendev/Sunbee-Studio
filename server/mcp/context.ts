import type { AuthInfo } from "@modelcontextprotocol/server";
import type { User } from "../../shared/types.js";
import { getUserById } from "../services/db/users-repo.js";

export interface McpToolContext {
  http?: { authInfo?: AuthInfo };
}

export function requireMcpUser(ctx: McpToolContext): User {
  const authInfo = ctx.http?.authInfo;
  if (!authInfo) {
    throw new Error("Thiếu thông tin xác thực MCP.");
  }
  const user = getUserById(authInfo.clientId);
  if (!user) {
    throw new Error("Tài khoản Sunbee gắn với token MCP này không còn tồn tại.");
  }
  return user;
}
