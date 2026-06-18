// packages/ai-sdk/src/skill/parser.ts
// Skill Engine Cách B — parse .skill.md → typed SkillDefinition
//
// Format of a .skill.md file:
// ---
// frontmatter (YAML) containing all structured data
// ---
// ## Mô tả (description)
// [Markdown content used as system prompt]

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import {
  SkillDefinitionSchema,
  type SkillDefinition,
  type AgentRegistryEntry,
} from "./types.js";

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a .skill.md file into a typed SkillDefinition
 */
export function parseSkillFile(filePath: string): SkillDefinition {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = matter(raw);

  const frontmatter = parsed.data as Record<string, unknown>;
  const markdown = parsed.content.trim();

  // Map frontmatter to SkillDefinition schema
  const data = {
    agentId: frontmatter["agent_id"] ?? frontmatter["agentId"] ?? basename(filePath, ".skill.md"),
    displayName: frontmatter["display_name"] ?? frontmatter["displayName"] ?? "",
    level: frontmatter["level"] ?? "staff",
    department: frontmatter["department"] ?? "",
    reportsTo: frontmatter["reports_to"] ?? frontmatter["reportsTo"],
    manages: frontmatter["manages"] ?? [],
    preferredProvider: frontmatter["preferred_provider"] ?? frontmatter["preferredProvider"],
    preferredModel: frontmatter["preferred_model"] ?? frontmatter["preferredModel"],
    authorityTable: frontmatter["authority_table"] ?? frontmatter["authorityTable"] ?? [],
    workflowTriggers: frontmatter["workflow_triggers"] ?? frontmatter["workflowTriggers"] ?? [],
    kpis: frontmatter["kpis"] ?? [],
    capabilities: frontmatter["capabilities"] ?? [],
    modules: frontmatter["modules"] ?? [],
    rawMarkdown: markdown,
  };

  return SkillDefinitionSchema.parse(data);
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Load all .skill.md files from a directory
 */
export function loadSkillDirectory(dirPath: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();

  let files: string[];
  try {
    files = readdirSync(dirPath).filter((f) => f.endsWith(".skill.md"));
  } catch {
    console.warn(`[SkillEngine] Directory not found: ${dirPath}`);
    return skills;
  }

  for (const file of files) {
    const filePath = join(dirPath, file);
    try {
      const skill = parseSkillFile(filePath);
      skills.set(skill.agentId, skill);
    } catch (err) {
      console.error(`[SkillEngine] Failed to parse ${file}:`, err);
    }
  }

  console.log(`[SkillEngine] Loaded ${skills.size} skills from ${dirPath}`);
  return skills;
}

// ─── Skill Registry Singleton ─────────────────────────────────────────────────

let _skillRegistry: Map<string, SkillDefinition> | null = null;

export function initSkillRegistry(skillsDir: string): void {
  _skillRegistry = loadSkillDirectory(skillsDir);
}

export function getSkillRegistry(): Map<string, SkillDefinition> {
  if (!_skillRegistry) {
    // Default skills directory
    const defaultDir = process.env["SKILLS_DIR"] ??
      join(process.cwd(), "skills");
    _skillRegistry = loadSkillDirectory(defaultDir);
  }
  return _skillRegistry;
}

export function getSkill(agentId: string): SkillDefinition | undefined {
  return getSkillRegistry().get(agentId);
}

export function getAllAgents(): AgentRegistryEntry[] {
  return Array.from(getSkillRegistry().values()).map((s) => ({
    agentId: s.agentId,
    displayName: s.displayName,
    level: s.level,
    department: s.department,
    skillFilePath: "", // not exposed in registry entry
  }));
}

/**
 * Build the system prompt for an agent
 * Combines: role description + authority rules summary + module context
 */
export function buildSystemPrompt(skill: SkillDefinition, aiMode: "full" | "assistant"): string {
  const modeInstr = aiMode === "full"
    ? `Bạn đang chạy ở chế độ FULL — có thể tự thực hiện các hành động trong phạm vi quyền hạn mà không cần hỏi.`
    : `Bạn đang chạy ở chế độ ASSISTANT — hãy đề xuất hành động và chờ người dùng xác nhận trước khi thực hiện.`;

  const authorityInstr = `
## Quyền Hạn Của Bạn
${skill.authorityTable.map((rule) => {
  const condition = rule.condition
    ? ` (khi ${rule.condition.field} ${rule.condition.operator} ${JSON.stringify(rule.condition.value)})`
    : "";
  return `- ${rule.action}${condition}: **${rule.result}**${rule.approver ? ` → cần ${rule.approver} duyệt` : ""}`;
}).join("\n")}

**QUAN TRỌNG:** Khi muốn thực hiện một hành động:
1. Kiểm tra bảng quyền hạn ở trên
2. Nếu SELF_EXECUTE (chế độ FULL): gọi tool tương ứng ngay
3. Nếu SELF_EXECUTE (chế độ ASSISTANT): đề xuất action, chờ user confirm
4. Nếu NEEDS_APPROVAL: tạo approval request, chờ người có thẩm quyền duyệt
5. Nếu ESCALATE: chuyển lên cấp trên ngay lập tức
6. Nếu NOT_ALLOWED: từ chối, giải thích lý do
`.trim();

  return `${skill.rawMarkdown}

---
${modeInstr}

${authorityInstr}

## Modules Được Phép Truy Cập
${skill.modules.length > 0 ? skill.modules.map((m) => `- ${m}`).join("\n") : "- Tất cả modules cơ bản"}`;
}
