// src/lib/agent-prompt.ts
// Xây system prompt cho AI agent (DB-defined). Dùng chung cho AI chat (ai.router) và
// chat realtime với agent (modules/chat/agent-reply).

export function buildDbAgentSystemPrompt(
  agent: { displayName: string; level: string; department?: string | null; systemPrompt: string },
  companyName: string,
): string {
  const levelMap: Record<string, string> = {
    board:   "Thành viên Hội Đồng Quản Trị",
    c_suite: "Thành viên Ban Giám Đốc",
    manager: "Cấp Quản Lý",
    staff:   "Nhân Viên",
    special: "Chuyên Gia",
  };

  return `Bạn là ${agent.displayName}${agent.department ? ` — ${agent.department}` : ""} của công ty ${companyName}.
Cấp bậc: ${levelMap[agent.level] ?? agent.level}

${agent.systemPrompt}

Phong cách giao tiếp:
- Sử dụng tiếng Việt là ngôn ngữ chính
- Chuyên nghiệp, rõ ràng, đúng vai trò
- Khi không chắc chắn, nêu rõ và đề xuất cách xác minh
- Không bịa số liệu hay thông tin cụ thể`;
}
