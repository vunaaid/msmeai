// src/lib/agent-tools.ts
// Cấu hình công cụ (MCP) cho agent chạy qua Claude CLI.
// Hiện expose: create_journal_entry (qua MCP server src/mcp/gl-mcp-server.ts).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prisma } from "@vsme/db/client";

const require = createRequire(import.meta.url);

/** Đường dẫn tuyệt đối tới MCP server (chạy bằng tsx). */
const MCP_SERVER_PATH = fileURLToPath(new URL("../mcp/gl-mcp-server.ts", import.meta.url));

/** Lệnh chạy file .ts: node + tsx CLI (tuyệt đối, không phụ thuộc PATH). */
function tsxRunner(): { command: string; baseArgs: string[] } {
  try {
    const tsxCli = require.resolve("tsx/dist/cli.mjs");
    return { command: process.execPath, baseArgs: [tsxCli] };
  } catch {
    return { command: "tsx", baseArgs: [] }; // fallback nếu tsx có trên PATH
  }
}

export interface AgentMcpTools {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  allowedTools: string[];
}

/** Tool ĐỌC (read-only, đa module) — luôn an toàn để bật cho agent. */
const READ_TOOLS = [
  "mcp__vsme__get_trial_balance",
  "mcp__vsme__get_account_balance",
  "mcp__vsme__list_journal_entries",
  "mcp__vsme__list_accounts",
  "mcp__vsme__list_work_items",
  "mcp__vsme__search_documents",
];

/**
 * Dựng cấu hình MCP "vsme" cho 1 công ty/người dùng.
 * - Luôn bật các tool ĐỌC (để agent lấy thông tin & phân tích).
 * - includeWrite → thêm create_journal_entry (mặc định KHÔNG; GL write vẫn do worker ghi tất định).
 * - roleId → phân quyền đọc tài liệu; workItemId → gắn bút toán ↔ công việc.
 */
export function buildAgentMcpServer(
  companyId: string,
  userId: string,
  opts: { roleId?: string | null; workItemId?: string; includeWrite?: boolean } = {},
): AgentMcpTools {
  const { command, baseArgs } = tsxRunner();
  return {
    mcpServers: {
      vsme: {
        command,
        args: [...baseArgs, MCP_SERVER_PATH],
        env: {
          ...(process.env as Record<string, string>),
          VSME_COMPANY_ID: companyId,
          VSME_USER_ID: userId,
          ...(opts.roleId ? { VSME_ROLE_ID: opts.roleId } : {}),
          ...(opts.workItemId ? { VSME_WORK_ITEM_ID: opts.workItemId } : {}),
        },
      },
    },
    allowedTools: opts.includeWrite ? [...READ_TOOLS, "mcp__vsme__create_journal_entry"] : READ_TOOLS,
  };
}

/** Role có quyền ghi/duyệt module GL không (→ được phép lập bút toán). */
export async function roleCanWriteGl(roleId: string | null): Promise<boolean> {
  if (!roleId) return false;
  const count = await prisma.rolePermission.count({
    where: { roleId, permission: { moduleKey: "gl", action: { in: ["write", "approve"] } } },
  });
  return count > 0;
}
