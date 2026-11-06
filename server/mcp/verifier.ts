import type { OAuthTokenVerifier } from "@modelcontextprotocol/express";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { findUserByMcpToken } from "../services/mcp/token.js";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function createMcpVerifier(expectedResource: URL): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const user = findUserByMcpToken(token);
      if (!user) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          "Token không hợp lệ hoặc tích hợp MCP chưa được bật trong Settings.",
        );
      }
      return {
        token,
        clientId: user.id,
        scopes: ["sunbee"],
        expiresAt: Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS,
        resource: expectedResource,
      };
    },
  };
}
