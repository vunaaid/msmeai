// src/app/(dashboard)/work/project/[id]/types.ts
// Kiểu dữ liệu dùng chung cho trang chi tiết dự án (Jira-style).

export interface ItemUser { id: string; name: string; avatarUrl?: string | null }

export interface ProjectItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  startedAt: string | null;
  createdAt: string;
  storyPoints: number | null;
  boardOrder: number;
  assignedTo: string | null;
  sprintId: string | null;
  epicId: string | null;
  assignee: ItemUser | null;
  epic: { id: string; title: string; color: string } | null;
  sprint: { id: string; name: string } | null;
  _count: { children: number; comments: number };
}

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  color: string;
  status: string;
  order: number;
  _count?: { workItems: number };
}

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  order: number;
  _count?: { workItems: number };
}

export interface ProjectMember { userId: string; role: string; user: ItemUser }

export interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  manager: ItemUser;
  creator: { id: string; name: string };
  members: ProjectMember[];
  epics: Epic[];
  sprints: Sprint[];
  _count: { workItems: number; members: number };
}

// ── Cấu hình hiển thị ──────────────────────────────────────────────────────

export const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  draft:            { label: "Nháp",       color: "text-slate-400",   dot: "bg-slate-500" },
  pending_approval: { label: "Chờ duyệt",  color: "text-amber-400",   dot: "bg-amber-500" },
  active:           { label: "Cần làm",    color: "text-blue-400",    dot: "bg-blue-500" },
  in_progress:      { label: "Đang làm",   color: "text-cyan-400",    dot: "bg-cyan-500" },
  completed:        { label: "Hoàn thành", color: "text-emerald-400", dot: "bg-emerald-500" },
  cancelled:        { label: "Đã hủy",     color: "text-slate-500",   dot: "bg-slate-600" },
};

export const PRIORITY_CFG: Record<string, { label: string; dot: string }> = {
  urgent: { label: "Khẩn cấp",   dot: "bg-red-500" },
  high:   { label: "Cao",        dot: "bg-orange-500" },
  normal: { label: "Bình thường", dot: "bg-slate-500" },
  low:    { label: "Thấp",       dot: "bg-slate-600" },
};

// Cột Kanban: mỗi cột gom các trạng thái, khi kéo vào sẽ đặt trạng thái canonical.
export const BOARD_COLUMNS: { key: string; label: string; status: string; match: string[] }[] = [
  { key: "todo",        label: "Cần làm",    status: "active",      match: ["draft", "pending_approval", "active"] },
  { key: "in_progress", label: "Đang làm",   status: "in_progress", match: ["in_progress"] },
  { key: "done",        label: "Hoàn thành", status: "completed",   match: ["completed"] },
];

export function columnOf(status: string): string {
  return BOARD_COLUMNS.find((c) => c.match.includes(status))?.key ?? "todo";
}
