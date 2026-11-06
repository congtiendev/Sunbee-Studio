import { requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { Router } from "express";
import { createServer } from "../mcp/create-server.js";
import { createMcpVerifier } from "../mcp/verifier.js";
import { PORT } from "../env.js";

const router = Router();

const expectedResource = new URL(`http://127.0.0.1:${PORT}/mcp`);
const verifier = createMcpVerifier(expectedResource);
const requireMcpAuth = requireBearerAuth({
  verifier,
  requiredScopes: ["sunbee"],
  expectedResource,
});

const handler = createMcpHandler(createServer);
const nodeHandler = toNodeHandler(handler);

router.all("/", requireMcpAuth, (req, res) => {
  void nodeHandler(req, res, req.body);
});

export default router;
