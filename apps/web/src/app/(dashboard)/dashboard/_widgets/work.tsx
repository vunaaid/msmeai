"use client";

// src/app/(dashboard)/dashboard/_widgets/work.tsx
// Widget vận hành: công việc, dự án, định kỳ, thông báo, phê duyệt AI.
// Mỗi widget tự fetch qua /api/* (cookie auth được proxy forward).

import {
  CheckSquare, Send, ClipboardList, FolderKanban, CalendarClock, Bell, ShieldCheck,
} from "lucide-react";
import { useApi } from "@/lib/api/client";
import { Card, State, Row, Badge, fmtDate, statusLabel, priorityTone, isOverdue } from "./ui";

interface WorkItem {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  assignee?: { id: string; name: string } | null;
  creator?: { id: string; name: string } | null;
  project?: { id: string; title: string } | null;
}

interface Project {
  id: string;
  title: string;
  status: string;
  manager?: { id: string; name: string } | null;
  _count?: { workItems?: number; members?: number };
}

interface Recurring {
  id: string;
  title: string;
  cadence: string;
  role?: { name: string } | null;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
}

interface AiApproval {
  id: string;
  action: string;
  reason: string;
  authorityResult: string;
  createdAt: string;
  task?: { id: string; title: string } | null;
}

const CADENCE: Record<string, string> = {
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  yearly: "Hàng năm",
};

function dueRight(it: WorkItem) {
  if (!it.dueDate) return <Badge>{statusLabel(it.status)}</Badge>;
  const over = isOverdue(it.dueDate, it.status);
  return (
    <Badge tone={over ? "bg-red-500/15 text-red-400" : "bg-slate-800 text-slate-400"}>
      {over ? "Quá hạn " : "Hạn "}{fmtDate(it.dueDate)}
    </Badge>
  );
}

export function MyTasksWidget() {
  const { data, meta, loading, error } = useApi<WorkItem[]>("/api/work?view=assigned_to_me&limit=6");
  const items = data ?? [];
  return (
    <Card title="Việc của tôi" icon={<CheckSquare size={16} />} href="/work" count={meta?.total} accent="text-blue-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Bạn chưa được giao việc nào">
        {items.map((it) => (
          <Row
            key={it.id}
            href={`/work/${it.id}`}
            title={<span className={priorityTone(it.priority)}>{it.title}</span>}
            meta={it.project?.title}
            right={dueRight(it)}
          />
        ))}
      </State>
    </Card>
  );
}

export function MySubmittedWidget() {
  const { data, meta, loading, error } = useApi<WorkItem[]>("/api/work?view=pending_approval&limit=6");
  const items = data ?? [];
  return (
    <Card title="Việc tôi gửi chờ duyệt" icon={<Send size={16} />} href="/work" count={meta?.total} accent="text-amber-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Không có việc nào đang chờ duyệt">
        {items.map((it) => (
          <Row key={it.id} href={`/work/${it.id}`} title={it.title} meta={it.assignee ? `Giao: ${it.assignee.name}` : undefined} right={dueRight(it)} />
        ))}
      </State>
    </Card>
  );
}

export function DelegatedWidget() {
  const { data, meta, loading, error } = useApi<WorkItem[]>("/api/work?view=created_by_me&limit=6");
  const items = data ?? [];
  return (
    <Card title="Việc tôi giao" icon={<ClipboardList size={16} />} href="/work" count={meta?.total} accent="text-cyan-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Bạn chưa giao việc cho ai">
        {items.map((it) => (
          <Row
            key={it.id}
            href={`/work/${it.id}`}
            title={it.title}
            meta={it.assignee ? `→ ${it.assignee.name}` : "Chưa giao"}
            right={<Badge>{statusLabel(it.status)}</Badge>}
          />
        ))}
      </State>
    </Card>
  );
}

export function ProjectsWidget() {
  const { data, meta, loading, error } = useApi<Project[]>("/api/projects?limit=6");
  const items = data ?? [];
  return (
    <Card title="Dự án" icon={<FolderKanban size={16} />} href="/work" count={meta?.total} accent="text-violet-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Chưa có dự án nào">
        {items.map((p) => (
          <Row
            key={p.id}
            href={`/work/project/${p.id}`}
            title={p.title}
            meta={p.manager ? `PM: ${p.manager.name}` : undefined}
            right={
              <span className="flex items-center gap-1">
                <Badge>{p._count?.workItems ?? 0} việc</Badge>
                <Badge>{statusLabel(p.status)}</Badge>
              </span>
            }
          />
        ))}
      </State>
    </Card>
  );
}

export function RecurringWidget() {
  const { data, loading, error } = useApi<Recurring[]>(`/api/recurring`);
  const items = (data ?? []).slice(0, 6);
  return (
    <Card title="Việc định kỳ" icon={<CalendarClock size={16} />} accent="text-teal-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Chưa có việc định kỳ">
        {items.map((r) => (
          <Row key={r.id} title={r.title} meta={r.role?.name} right={<Badge>{CADENCE[r.cadence] ?? r.cadence}</Badge>} />
        ))}
      </State>
    </Card>
  );
}

export function NotificationsWidget() {
  const { data, meta, loading, error } = useApi<Notification[]>("/api/notifications?unreadOnly=true&limit=6");
  const items = data ?? [];
  return (
    <Card title="Thông báo chưa đọc" icon={<Bell size={16} />} href="/notifications" count={meta?.total} accent="text-rose-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Bạn đã đọc hết thông báo">
        {items.map((n) => (
          <Row key={n.id} title={n.title} meta={n.body} right={<span className="text-slate-500">{fmtDate(n.createdAt)}</span>} />
        ))}
      </State>
    </Card>
  );
}

export function AiApprovalsWidget() {
  const { data, meta, loading, error } = useApi<AiApproval[]>("/api/ai/approvals?status=pending&limit=6");
  const items = data ?? [];
  return (
    <Card title="Phê duyệt AI đang chờ" icon={<ShieldCheck size={16} />} href="/ai/approvals" count={meta?.total} accent="text-emerald-400">
      <State loading={loading} error={error} empty={items.length === 0} emptyText="Không có yêu cầu phê duyệt nào">
        {items.map((a) => (
          <Row
            key={a.id}
            href="/ai/approvals"
            title={a.task?.title ?? a.action}
            meta={a.reason}
            right={
              <Badge tone={a.authorityResult === "ESCALATE" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}>
                {a.authorityResult === "ESCALATE" ? "Vượt cấp" : "Cần duyệt"}
              </Badge>
            }
          />
        ))}
      </State>
    </Card>
  );
}
