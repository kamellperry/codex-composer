#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  askSchema,
  handleAsk,
  handleHealth,
  handlePatch,
  handleUiReview,
  healthSchema,
  patchSchema,
  uiReviewSchema
} from "./tools.js";

const server = new McpServer({
  name: "codex-composer",
  version: "0.1.0"
});

server.registerTool(
  "composer_health",
  {
    title: "Composer health",
    description: "Check Cursor SDK availability, auth, and live Composer model access.",
    inputSchema: healthSchema
  },
  handleHealth
);

server.registerTool(
  "composer_ask",
  {
    title: "Ask Composer",
    description: "Ask Cursor Composer 2.5 for code, architecture, UI, or design guidance from a safe sandbox.",
    inputSchema: askSchema
  },
  handleAsk
);

server.registerTool(
  "composer_patch",
  {
    title: "Composer patch",
    description: "Ask Composer to modify a temporary sandbox and return a diff without touching the real repo.",
    inputSchema: patchSchema
  },
  handlePatch
);

server.registerTool(
  "composer_ui_review",
  {
    title: "Composer UI review",
    description: "Ask Composer 2.5 to review screenshots or UI images with optional repository context.",
    inputSchema: uiReviewSchema
  },
  handleUiReview
);

await server.connect(new StdioServerTransport());
