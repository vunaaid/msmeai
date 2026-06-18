"use client";

// src/app/(dashboard)/work/work-dashboard.tsx

import { useState } from "react";
import Link from "next/link";
import {
  ClipboardList, Plus, RefreshCw, FolderKanban,
  Clock, CheckCircle2, XCircle, Loader2, ChevronRight,
  AlertTriangle, TrendingUp, Users, Calendar,
  Inbox, Send, Hourglass, Sparkles, CalendarClock, Pencil, ListChecks,
} from "lucide-react";
import { CreateWorkModal } from "./create-work-modal";
import { CreateProjectModal } from "./create-project-modal";
import { WorkAssistant } from "./work-assistant";
import { BreakdownModal } from "./breakdown-modal";
import { PageHeader } from "@/components/layout/page-header";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { useApi, apiSend } from "@/lib/api/client";

type WorkItemPriority = "urgent" | "high" | "normal" | "low";
type WorkItemStatus   = "draft" | "pending_approval" | "active" | "in_progress" | "completed" | "cancelled";

interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  workType: "operational" | "project_task";
  status: WorkItemStatus;
  priority: WorkItemPriority;
  dueDate: string | null;
  createdAt: string;
  creator:  { id: string; name: string; avatarUrl: string | null };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  project:  { id: string; title: string } | null;
  _count:   { children: number; comments: number };
}

interface Project {
  id: string;
  title: string;
  status: string;
  priority: WorkItemPriority;
  dueDate: string | null;
  manager: { id: string; name: string; avatarUrl: string | null };
  _count: { workItems: number; members: number };
}

type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";
type Quarter = 1 | 2 | 3 | 4;

interface Assignee { id: string; name: string; avatarUrl: string | null }
interface Occurrence { date: string; periodKey: string; quarter: Quarter }

interface RecurringItem {
  id: string;
  title: string;
  description: string | null;
  cadence: Cadence;
  priority: WorkItemPriority;
  module: string | null;
  dueOffsetDays: number;
  active: boolean;
  role: { id: string; name: string; level: string };
  assignees: Assignee[];
  occurrences: Occurrence[];
}

const CADENCE_CFG: Record<Cadence, { label: string; color: string }> = {
  weekly:    { label: "Hàng tuần", color: "text-cyan-400" },
  monthly:   { label: "Hàng tháng", color: "text-blue-400" },
  quarterly: { label: "Hàng quý", color: "text-amber-400" },
  yearly:    { label: "Hàng năm", color: "text-purple-400" },
};

// Nhãn trạng thái hiển thị cho người dùng (gom về: Chưa thực hiện / Đang thực hiện /
// Hoàn thành) — vẫn giữ đủ trạng thái nội bộ cho luồng duyệt & agent.
const STATUS_CFG: Record<WorkItemStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:            { label: "Chưa thực hiện", color: "text-slate-400",   bg: "bg-slate-800/40",    icon: Clock },
  pending_approval: { label: "Chờ duyệt",      color: "text-amber-400",   bg: "bg-amber-900/20",    icon: Hourglass },
  active:           { label: "Chưa thực hiện", color: "text-blue-400",    bg: "bg-blue-900/20",     icon: Send },
  in_progress:      { label: "Đang thực hiện", color: "text-cyan-400",    bg: "bg-cyan-900/20",     icon: TrendingUp },
  completed:        { label: "Hoàn thành",     color: "text-emerald-400", bg: "bg-emerald-900/20",  icon: CheckCircle2 },
  cancelled:        { label: "Đã hủy",         color: "text-slate-500",   bg: "bg-slate-800/20",    icon: XCircle },
};

// Trạng thái suy ra "Quá hạn" (không lưu DB): dueDate < nay & chưa hoàn thành/huỷ.
const STATUS_OVERDUE = { label: "Quá hạn", color: "text-red-400", bg: "bg-red-900/20", icon: AlertTriangle } as const;

function isOverdue(status: WorkItemStatus, dueDate: string | null): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  return new Date(dueDate).getTime() < Date.now();
}

// 3 mức ưu tiên hiển thị: Cao / Trung bình / Thấp ("urgent" gộp hiển thị như "Cao").
const PRIORITY_CFG: Record<WorkItemPriority, { label: string; dot: string }> = {
  urgent: { label: "Cao",        dot: "bg-orange-400" },
  high:   { label: "Cao",        dot: "bg-orange-400" },
  normal: { label: "Trung bình", dot: "bg-slate-400" },
  low:    { label: "Thấp",       dot: "bg-slate-600" },
};

const PROJECT_STATUS_CFG: Record<string, { label: string; color: string }> = {
  planning:  { label: "Kế hoạch", color: "text-slate-400" },
  active:    { label: "Triển khai", color: "text-blue-400" },
  on_hold:   { label: "Tạm dừng", color: "text-amber-400" },
  completed: { label: "Hoàn thành", color: "text-emerald-400" },
  cancelled: { label: "Hủy", color: "text-red-400" },
};

type TabView = "assigned_to_me" | "created_by_me" | "project_tasks" | "pending_approval" | "projects" | "recurring";

// Nhóm tiến độ (sub-tab) cho các tab việc cá nhân/giao/dự án.
type Bucket = "in_progress" | "overdue" | "completed";
const BUCKET_CFG: { key: Bucket; label: string; icon: React.ElementType; color: string }[] = [
  { key: "in_progress", label: "Đang thực hiện", icon: TrendingUp,   color: "text-cyan-400" },
  { key: "overdue",     label: "Quá hạn",        icon: AlertTriangle, color: "text-red-400" },
  { key: "completed",   label: "Đã hoàn thành",  icon: CheckCircle2,  color: "text-emerald-400" },
];
const BUCKET_TABS = new Set<TabView>(["assigned_to_me", "created_by_me", "project_tasks"]);

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0)  return { text: `Quá hạn ${Math.abs(days)}n`, overdue: true };
  if (days === 0) return { text: "Hôm nay", overdue: false };
  if (days === 1) return { text: "Ngày mai", overdue: false };
  return { text: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }), overdue: false };
}

function UserAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const initials = name.trim().split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();
  return (
    <div className={`${size === "sm" ? "w-6 h-6 text-xs" : "w-5 h-5 text-[10px]"} rounded-full bg-cyan-700 flex items-center justify-center flex-shrink-0 font-medium text-white`}>
      {initials}
    </div>
  );
}

export function WorkDashboard({ userId, userName, roleName, roleLevel, canManage }: {
  userId: string;
  userName: string;
  roleName: string | null;
  roleLevel: string | null;
  canManage: boolean;
}) {
  const [tab, setTab]         = useState<TabView>("assigned_to_me");
  const [bucket, setBucket]   = useState<Bucket>("in_progress");
  const [createWorkOpen, setCreateWorkOpen]     = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  // Câu hỏi đẩy sang panel Trợ lý AI (khi bấm AI trên 1 công việc chưa thực hiện)
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null);
  // Công việc ngữ cảnh của trợ lý (để "Cập nhật" ghi vào mô tả việc này)
  const [contextWork, setContextWork] = useState<{ id: string; title: string } | null>(null);
  // Công việc đang xem phân tích AI (đã phân giao)
  const [breakdownItem, setBreakdownItem] = useState<{ id: string; title: string } | null>(null);

  const askAssistant = (item: WorkItem) => {
    setContextWork({ id: item.id, title: item.title });
    setAssistantPrompt(
      `Hãy giúp tôi thực hiện công việc sau:\n\n• Tiêu đề: ${item.title}` +
      (item.description ? `\n• Mô tả: ${item.description}` : "") +
      `\n\nĐề xuất cách thực hiện cụ thể, từng bước.`
    );
  };

  const hasBuckets = BUCKET_TABS.has(tab);
  const path =
    tab === "projects"  ? "/api/projects?limit=50" :
    tab === "recurring" ? "/api/recurring?mine=1" :
    hasBuckets          ? `/api/work?view=${tab}&bucket=${bucket}&limit=50` :
    `/api/work?view=${tab}&limit=50`;

  const { data, meta, loading, refreshing, error, refresh } =
    useApi<WorkItem[] | Project[] | RecurringItem[]>(path);

  const isWorkTab = tab === "assigned_to_me" || tab === "created_by_me" || tab === "project_tasks" || tab === "pending_approval";
  const total     = meta?.total ?? (data?.length ?? 0);
  const items     = isWorkTab ? ((data as WorkItem[] | null) ?? []) : [];
  const projects  = tab === "projects" ? ((data as Project[] | null) ?? []) : [];
  const recurring = tab === "recurring" ? ((data as RecurringItem[] | null) ?? []) : [];

  // Sau khi tạo dự án: nếu đang ở tab khác → chuyển sang projects (tự load),
  // nếu đã ở projects → refresh.
  const onProjectCreated = () => {
    if (tab === "projects") refresh();
    else setTab("projects");
  };

  const TABS: { key: TabView; label: string; icon: React.ElementType; desc: string }[] = [
    { key: "assigned_to_me",   label: "Việc của tôi",    icon: Inbox,         desc: "Công việc được giao cho tôi" },
    { key: "created_by_me",    label: "Tôi giao",        icon: Send,          desc: "Công việc tôi đã giao cho người khác" },
    { key: "project_tasks",    label: "Việc dự án",      icon: ListChecks,    desc: "Công việc thuộc dự án tôi làm hoặc tôi giao" },
    { key: "pending_approval", label: "Chờ duyệt",       icon: Hourglass,     desc: "Công việc tôi tạo, chờ AI phân tích & duyệt" },
    { key: "projects",         label: "Dự án",           icon: FolderKanban,  desc: "Quản lý công việc theo dự án" },
    { key: "recurring",        label: "Việc định kỳ",    icon: CalendarClock, desc: "Danh mục công việc lặp lại theo vai trò" },
  ];

  return (
    <>
      <div className="max-w-[1600px] mx-auto space-y-5">
        {/* Header */}
        <PageHeader
          icon={ClipboardList}
          iconColor="text-cyan-400"
          title="Quản Lý Công Việc"
          subtitle="Giao việc, theo dõi tiến độ, phân tích với AI"
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-right leading-tight">
                <div className="text-xs sm:text-sm font-medium text-white truncate max-w-[120px] sm:max-w-[200px]">{userName}</div>
                {roleName && <div className="text-[11px] sm:text-xs text-slate-400 truncate max-w-[120px] sm:max-w-[200px]">{roleName}</div>}
              </div>
              <SignOutButton />
            </div>
          }
        />

        {/* 2 cột: công việc (3/4) + Trợ lý AI (1/4) — xếp chồng trên mobile */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          <div className="lg:flex-[3] min-w-0 space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit max-w-full overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                  tab === t.key
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tabs: nhóm tiến độ (chỉ với tab Việc của tôi / Tôi giao / Việc dự án) */}
        {hasBuckets && (
          <div className="flex gap-2 flex-wrap">
            {BUCKET_CFG.map(b => {
              const Icon = b.icon;
              const active = bucket === b.key;
              const count = meta?.counts?.[b.key];
              return (
                <button
                  key={b.key}
                  onClick={() => setBucket(b.key)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? "bg-slate-800 border-slate-600 text-white"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <Icon size={14} className={active ? b.color : ""} />
                  {b.label}
                  <span className={`min-w-[1.25rem] text-center text-xs px-1.5 py-0.5 rounded-full ${
                    active ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-500"
                  }`}>
                    {count ?? "–"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Card Header */}
          <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 sm:py-3.5 border-b border-slate-800">
            <p className="text-xs sm:text-sm text-slate-400 min-w-0 truncate">
              {TABS.find(t => t.key === tab)?.desc}
              {total > 0 && <span className="ml-2 text-slate-600">· {total} mục</span>}
            </p>
            <div className="flex items-center gap-2">
              {isWorkTab && (
                <button
                  onClick={() => setCreateWorkOpen(true)}
                  title="Tạo công việc"
                  aria-label="Tạo công việc"
                  className="p-1.5 text-cyan-400 hover:text-white border border-cyan-700/50 hover:bg-cyan-600 hover:border-cyan-600 rounded-lg transition-colors"
                >
                  <Plus size={13} />
                </button>
              )}
              {tab === "projects" && (
                <button
                  onClick={() => setCreateProjectOpen(true)}
                  title="Tạo dự án"
                  aria-label="Tạo dự án"
                  className="p-1.5 text-cyan-400 hover:text-white border border-cyan-700/50 hover:bg-cyan-600 hover:border-cyan-600 rounded-lg transition-colors"
                >
                  <Plus size={13} />
                </button>
              )}
              <button
                onClick={refresh}
                disabled={refreshing || loading}
                title="Làm mới"
                aria-label="Làm mới"
                className="p-1.5 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-40"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-cyan-500" />
                <p className="text-sm text-slate-500">Đang tải...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <XCircle size={32} className="text-red-500/50" />
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={refresh}
                className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                Thử lại
              </button>
            </div>
          ) : tab === "recurring" ? (
            // Recurring (việc định kỳ) — 1 vai trò + cột vai trò liên quan
            <RecurringView items={recurring} canManage={canManage} onChanged={refresh} />
          ) : tab === "projects" ? (
            // Projects view
            projects.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                text="Chưa có dự án nào"
                action={{ label: "Tạo dự án đầu tiên", onClick: () => setCreateProjectOpen(true) }}
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {projects.map(p => (
                  <Link key={p.id} href={`/work/project/${p.id}`}
                    className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 hover:bg-slate-800/40 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0">
                      <FolderKanban size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 group-hover:text-white truncate">{p.title}</span>
                        <span className={`text-xs ${PROJECT_STATUS_CFG[p.status]?.color ?? "text-slate-400"}`}>
                          {PROJECT_STATUS_CFG[p.status]?.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Users size={11} /> {p._count.members} thành viên
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <ClipboardList size={11} /> {p._count.workItems} việc
                        </span>
                        {p.dueDate && (() => {
                          const d = formatDate(p.dueDate);
                          return d ? (
                            <span className={`text-xs flex items-center gap-1 ${d.overdue ? "text-red-400" : "text-slate-500"}`}>
                              <Calendar size={11} /> {d.text}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserAvatar name={p.manager?.name ?? "?"} />
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : (
            // Work items view
            items.length === 0 ? (
              <EmptyState
                icon={
                  tab === "assigned_to_me" ? Inbox :
                  tab === "created_by_me"  ? Send :
                  tab === "project_tasks"  ? ListChecks :
                  Hourglass
                }
                text={
                  hasBuckets
                    ? `Không có việc ${BUCKET_CFG.find(b => b.key === bucket)?.label.toLowerCase()}`
                    : "Không có công việc nào chờ duyệt"
                }
                action={tab !== "pending_approval" ? undefined : { label: "Tạo công việc mới", onClick: () => setCreateWorkOpen(true) }}
              />
            ) : (
              <div className="divide-y divide-slate-800">
                {items.map(item => (
                  <WorkItemRow
                    key={item.id}
                    item={item}
                    userId={userId}
                    onAskAssistant={askAssistant}
                    onViewBreakdown={(it) => setBreakdownItem({ id: it.id, title: it.title })}
                  />
                ))}
              </div>
            )
          )}
        </div>
          </div>

          {/* Trợ lý AI — 1/4 */}
          <div className="w-full lg:flex-1 min-w-0">
            <WorkAssistant
              roleName={roleName}
              roleLevel={roleLevel}
              prompt={assistantPrompt}
              onPromptConsumed={() => setAssistantPrompt(null)}
              contextWork={contextWork}
              onChanged={refresh}
            />
          </div>
        </div>
      </div>

      <CreateWorkModal
        open={createWorkOpen}
        onClose={() => setCreateWorkOpen(false)}
        onSuccess={refresh}
      />
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onSuccess={onProjectCreated}
      />
      {breakdownItem && (
        <BreakdownModal
          itemId={breakdownItem.id}
          itemTitle={breakdownItem.title}
          onClose={() => setBreakdownItem(null)}
        />
      )}
    </>
  );
}

function WorkItemRow({ item, userId, onAskAssistant, onViewBreakdown }: {
  item: WorkItem;
  userId: string;
  onAskAssistant: (item: WorkItem) => void;
  onViewBreakdown: (item: WorkItem) => void;
}) {
  const overdue = isOverdue(item.status, item.dueDate);
  const cfg   = overdue ? STATUS_OVERDUE : (STATUS_CFG[item.status] ?? STATUS_CFG.draft);
  const pCfg  = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.normal;
  const Icon  = cfg.icon;
  const due   = formatDate(item.dueDate);
  const isMe  = item.assignee?.id === userId;
  const delegated  = item._count.children > 0;
  const notStarted = !delegated && ["draft", "active", "pending_approval"].includes(item.status);

  return (
    <Link href={`/work/${item.id}`}
      className="flex items-start gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 hover:bg-slate-800/40 transition-colors group"
    >
      {/* Status icon */}
      <div className={`mt-0.5 p-1.5 rounded-lg ${cfg.bg} flex-shrink-0`}>
        <Icon size={14} className={cfg.color} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span className="text-[13px] sm:text-sm font-medium text-slate-200 group-hover:text-white">{item.title}</span>
          {item.workType === "project_task" && item.project && (
            <span className="text-[11px] sm:text-xs text-blue-400 bg-blue-900/20 border border-blue-800/30 px-1.5 py-0.5 rounded">
              {item.project.title}
            </span>
          )}
          <span className={`text-[11px] sm:text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>

        {item.description && (
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{item.description}</p>
        )}

        <div className="flex items-center gap-2 sm:gap-3 mt-1.5 flex-wrap">
          {/* Priority dot */}
          <span className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot} flex-shrink-0`} />
            {pCfg.label}
          </span>

          {/* Due date */}
          {due && (
            <span className={`flex items-center gap-1 text-[11px] sm:text-xs ${due.overdue ? "text-red-400" : "text-slate-500"}`}>
              {due.overdue && <AlertTriangle size={10} />}
              <Calendar size={10} />
              {due.text}
            </span>
          )}

          {/* Subtask count */}
          {item._count.children > 0 && (
            <span className="text-[11px] sm:text-xs text-slate-600">
              {item._count.children} việc con
            </span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {delegated ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewBreakdown(item); }}
            title="Xem phân tích AI lần trước"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-purple-300 bg-purple-600/15 border border-purple-700/40 hover:bg-purple-600/30 text-xs font-medium"
          >
            <Sparkles size={13} />
            {item._count.children}
          </button>
        ) : notStarted ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAskAssistant(item); }}
            title="Giao cho trợ lý AI thực hiện"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-purple-300 bg-purple-600/15 border border-purple-700/40 hover:bg-purple-600/30"
          >
            <Sparkles size={14} />
          </button>
        ) : null}

        {item.assignee ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar name={item.assignee.name} />
            <span className={`text-[11px] sm:text-xs ${isMe ? "text-cyan-400" : "text-slate-500"}`}>
              {isMe ? "Bạn" : item.assignee.name}
            </span>
          </div>
        ) : (
          <span className="text-[11px] sm:text-xs text-slate-600">Chưa giao</span>
        )}
        <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
      </div>
    </Link>
  );
}

const LEVEL_ORDER: Record<string, number> = {
  board: 0, c_suite: 1, company_admin: 2, manager: 3, staff: 4, system: 5,
};
const LEVEL_LABEL: Record<string, string> = {
  board: "HĐQT", c_suite: "C-Suite", company_admin: "Quản trị", manager: "Quản lý", staff: "Nhân viên", system: "Hệ thống",
};

interface RoleGroup { id: string; name: string; level: string; duties: RecurringItem[] }

const QUARTER_LABEL: Record<Quarter, string> = { 1: "Quý I", 2: "Quý II", 3: "Quý III", 4: "Quý IV" };
const WEEKDAY_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function avatarInitials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();
}

// Định dạng ngày + đếm ngược từ "YYYY-MM-DD" (so với hôm nay theo ngày lịch).
function dueInfo(iso: string) {
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const weekday = WEEKDAY_VI[target.getDay()] ?? "";
  const dm = `${String(target.getDate()).padStart(2, "0")}/${String(target.getMonth() + 1).padStart(2, "0")}`;
  let badge: { text: string; cls: string };
  // Đây là DANH MỤC kế hoạch theo vai trò (chỉ hiển thị lịch trong năm) — không phải
  // việc thực tế đang theo dõi tiến độ, nên mốc đã qua chỉ là "Đã qua", không báo "quá hạn".
  if (days < 0) badge = { text: "Đã qua", cls: "text-slate-600 border border-slate-700/40" };
  else if (days === 0) badge = { text: "Hôm nay", cls: "text-cyan-400 bg-cyan-900/20 border border-cyan-800/40" };
  else if (days <= 5) badge = { text: `Còn ${days} ngày`, cls: "text-amber-400 bg-amber-900/20 border border-amber-800/40" };
  else badge = { text: `Còn ${days} ngày`, cls: "text-slate-500 border border-slate-700/40" };
  return { days, weekday, dm, badge };
}

// Nhóm avatar nhân sự liên quan + tooltip liệt kê đầy đủ tên.
function AvatarGroup({ people }: { people: Assignee[] }) {
  if (people.length === 0) return <span className="text-[11px] text-slate-600 italic">Chưa có nhân sự</span>;
  const shown = people.slice(0, 4);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5" title={people.map((p) => p.name).join(", ")}>
      {shown.map((p) => (
        <div key={p.id} className="w-6 h-6 rounded-full ring-2 ring-slate-900 bg-cyan-700 flex items-center justify-center text-[10px] font-medium text-white">
          {avatarInitials(p.name)}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-6 h-6 rounded-full ring-2 ring-slate-900 bg-slate-700 flex items-center justify-center text-[10px] text-slate-200">+{rest}</div>
      )}
    </div>
  );
}

interface RowEntry { duty: RecurringItem; occ: Occurrence; weeklyCount?: number }

function RecurringView({
  items, canManage, onChanged,
}: {
  items: RecurringItem[];
  canManage: boolean;
  onChanged: () => void;
}) {
  // Nhóm theo vai trò — chỉ gồm vai trò của user (backend đã lọc mine=1).
  const roleMap = new Map<string, RoleGroup>();
  for (const it of items) {
    const r = it.role;
    const key = r?.id ?? "_other";
    if (!roleMap.has(key)) roleMap.set(key, { id: key, name: r?.name ?? "Khác", level: r?.level ?? "staff", duties: [] });
    roleMap.get(key)!.duties.push(it);
  }
  const roles = [...roleMap.values()].sort(
    (a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || a.name.localeCompare(b.name)
  );

  const [editing, setEditing] = useState<{ id: string; periodKey: string } | null>(null);
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);

  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
          <CalendarClock size={24} className="text-slate-600" />
        </div>
        <p className="text-sm text-slate-500">Chưa có công việc định kỳ nào</p>
        <Link href="/admin/recurring" className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
          Cấu hình danh mục việc định kỳ
        </Link>
      </div>
    );
  }

  const saveOverride = async (id: string, periodKey: string, date: string) => {
    setSaving(true);
    try {
      await apiSend(`/api/recurring/${id}/occurrence`, "PUT", { periodKey, date });
      setEditing(null);
      onChanged();
    } catch {
      // lỗi sẽ được phản ánh khi refresh; bỏ qua chi tiết ở đây
    } finally {
      setSaving(false);
    }
  };

  // Xếp việc (đang bật) của 1 vai trò vào 4 quý theo ngày đã tính.
  const quartersFor = (duties: RecurringItem[]): Record<Quarter, RowEntry[]> => {
    const quarters: Record<Quarter, RowEntry[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const d of duties) {
      if (!d.active) continue;
      if (d.cadence === "weekly") {
        const byQ = new Map<Quarter, Occurrence[]>();
        for (const o of d.occurrences) {
          const arr = byQ.get(o.quarter) ?? [];
          arr.push(o);
          byQ.set(o.quarter, arr);
        }
        for (const [q, occs] of byQ) {
          const sorted = [...occs].sort((a, b) => a.date.localeCompare(b.date));
          const next = sorted.find((o) => dueInfo(o.date).days >= 0) ?? sorted[sorted.length - 1];
          if (next) quarters[q].push({ duty: d, occ: next, weeklyCount: sorted.length });
        }
      } else {
        for (const o of d.occurrences) quarters[o.quarter].push({ duty: d, occ: o });
      }
    }
    for (const q of [1, 2, 3, 4] as Quarter[]) quarters[q].sort((a, b) => a.occ.date.localeCompare(b.occ.date));
    return quarters;
  };

  // Hiển thị kế hoạch năm cho TỪNG vai trò của user (chính + bổ sung), không có bộ chọn vai trò.
  return (
    <div className="p-3 sm:p-5 space-y-7">
      {roles.map((role) => {
        const quarters = quartersFor(role.duties);
        const totalActive = role.duties.filter((d) => d.active).length;
        return (
          <div key={role.id}>
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-cyan-400" />
              <span className="text-base font-semibold text-white">{role.name}</span>
              <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{LEVEL_LABEL[role.level] ?? role.level}</span>
              <span className="text-xs text-slate-500">· {totalActive} việc định kỳ / năm</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([1, 2, 3, 4] as Quarter[]).map((q) => (
                <div key={q} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{QUARTER_LABEL[q]}</span>
                    <span className="text-[10px] text-slate-600">{quarters[q].length} việc</span>
                  </div>
                  {quarters[q].length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-600">Không có việc</div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {quarters[q].map((row) => {
                        const d = row.duty;
                        const info = dueInfo(row.occ.date);
                        const pCfg = PRIORITY_CFG[d.priority] ?? PRIORITY_CFG.normal;
                        const isEditing = editing?.id === d.id && editing?.periodKey === row.occ.periodKey;
                        return (
                          <div key={`${d.id}:${row.occ.periodKey}`} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pCfg.dot}`} />
                              <span className="text-sm text-slate-200 flex-1 min-w-0 truncate" title={d.title}>{d.title}</span>
                              <AvatarGroup people={d.assignees} />
                            </div>
                            <div className="flex items-center gap-2 mt-1 pl-3.5 flex-wrap">
                              {d.cadence === "weekly" ? (
                                <span className="text-[11px] text-cyan-400">Mỗi thứ 6 · {row.weeklyCount} lần</span>
                              ) : (
                                <span className={`text-[11px] ${CADENCE_CFG[d.cadence]?.color ?? "text-slate-500"}`}>{CADENCE_CFG[d.cadence]?.label}</span>
                              )}
                              {d.module && <span className="text-[11px] text-slate-600">{d.module}</span>}
                              {!isEditing && (
                                <>
                                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Calendar size={10} /> {info.weekday} {info.dm}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${info.badge.cls}`}>{info.badge.text}</span>
                                  {canManage && (
                                    <button
                                      onClick={() => { setEditing({ id: d.id, periodKey: row.occ.periodKey }); setEditDate(row.occ.date); }}
                                      title="Sửa ngày"
                                      className="text-slate-600 hover:text-cyan-400"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </>
                              )}
                              {isEditing && (
                                <span className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                                  />
                                  <button
                                    disabled={saving || !editDate}
                                    onClick={() => saveOverride(d.id, row.occ.periodKey, editDate)}
                                    className="text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                                  >Lưu</button>
                                  <button
                                    disabled={saving}
                                    onClick={() => setEditing(null)}
                                    className="text-[11px] text-slate-500 hover:text-slate-300"
                                  >Huỷ</button>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  icon: Icon, text, action,
}: {
  icon: React.ElementType;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
        <Icon size={24} className="text-slate-600" />
      </div>
      <p className="text-sm text-slate-500">{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
