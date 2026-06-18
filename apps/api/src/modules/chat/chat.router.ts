// src/modules/chat/chat.router.ts
// Chat realtime (1-1 & nhóm). Transport realtime = SSE (lib/realtime.ts), zero-dep.
//
// GET  /chat/contacts                      — danh bạ user cùng công ty
// GET  /chat/conversations                 — hội thoại của tôi (+ lastMessage, unread)
// POST /chat/conversations                 — tạo hội thoại (direct idempotent / group)
// GET  /chat/conversations/:id/messages    — lịch sử (phân trang lùi)
// POST /chat/conversations/:id/messages    — gửi tin → fan-out SSE + web push
// POST /chat/conversations/:id/read        — đánh dấu đã đọc
// GET  /chat/stream                        — SSE: nhận realtime theo user

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@vsme/db/client";
import { requireAuth } from "../../middleware/auth.js";
import { ok, created, badRequest, forbidden, notFound, wrap } from "../../lib/response.js";
import { param, qs, qi } from "../../lib/query.js";
import { addClient, pushToUsers, isOnline, startKeepalive } from "../../lib/realtime.js";
import { sendPushToUsers } from "../../lib/push.js";
import { maybeTriggerAgentReply } from "./agent-reply.js";

const router = Router();

// ─── GET /chat/contacts ───────────────────────────────────────────────────────

router.get("/contacts", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId, isActive: true, id: { not: user.id } },
    select: { id: true, name: true, avatarUrl: true, accountType: true, role: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return ok(res, users.map((u) => ({
    id: u.id, name: u.name, avatarUrl: u.avatarUrl,
    role: u.role?.name ?? null,
    isAgent: u.accountType === "agent",
  })));
}));

// ─── Helper: kiểm tra user là participant của hội thoại ───────────────────────

async function getMembership(conversationId: string, userId: string) {
  return prisma.chatParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

// Tìm hội thoại 1-1 đã có giữa 2 người (idempotent cho direct).
async function findDirectConversation(companyId: string, aId: string, bId: string) {
  return prisma.chatConversation.findFirst({
    where: {
      companyId, type: "direct",
      participants: { every: { userId: { in: [aId, bId] } } },
      AND: [
        { participants: { some: { userId: aId } } },
        { participants: { some: { userId: bId } } },
      ],
    },
    select: { id: true },
  });
}

// "Trợ lý của user" = AI agent (persona user) khớp theo vai trò của user —
// cùng logic với WorkAssistant: khớp tên role trong displayName, rồi tới level, rồi agent đầu.
async function resolveAssistantAgent(
  companyId: string, roleName: string | null, roleLevel: string | null,
): Promise<{ userId: string; name: string } | null> {
  const agents = await prisma.companyAgent.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: { displayName: true, level: true, persona: { select: { id: true, name: true, isActive: true } } },
  });
  const withPersona = agents.filter((a) => a.persona?.isActive);
  if (withPersona.length === 0) return null;

  const rn = (roleName ?? "").toLowerCase().trim();
  const match =
    (rn ? withPersona.find((a) => a.displayName.toLowerCase().includes(rn)) : undefined) ??
    (roleLevel ? withPersona.find((a) => a.level === roleLevel) : undefined) ??
    withPersona[0]!;

  return { userId: match.persona!.id, name: match.persona!.name };
}

// ─── GET /chat/assistant — get-or-create hội thoại với trợ lý của tôi ──────────

router.get("/assistant", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const agent = await resolveAssistantAgent(user.companyId, user.roleName, user.roleLevel);
  if (!agent) return ok(res, null);

  let convId = (await findDirectConversation(user.companyId, user.id, agent.userId))?.id;
  if (!convId) {
    const conv = await prisma.chatConversation.create({
      data: {
        companyId: user.companyId, type: "direct", createdBy: user.id,
        participants: { create: [{ userId: user.id }, { userId: agent.userId }] },
      },
      select: { id: true },
    });
    convId = conv.id;
  }
  return ok(res, {
    conversationId: convId,
    agentUserId: agent.userId,
    agentName: agent.name,
    roleName: user.roleName ?? null, // để FE đặt nhãn "Trợ lý <vai trò>"
  });
}));

// ─── GET /chat/conversations ──────────────────────────────────────────────────

router.get("/conversations", requireAuth, wrap(async (req, res) => {
  const user = req.user!;

  const assistant = await resolveAssistantAgent(user.companyId, user.roleName, user.roleLevel);
  const assistantUserId = assistant?.userId ?? null;

  const parts = await prisma.chatParticipant.findMany({
    where: { userId: user.id, conversation: { companyId: user.companyId } },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: { id: true, name: true, avatarUrl: true, accountType: true } } } },
          messages:     { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  // unread cho mỗi hội thoại: message của người khác, mới hơn lastReadAt
  const result = await Promise.all(parts.map(async (p) => {
    const c = p.conversation;
    const others = c.participants.filter((m) => m.userId !== user.id).map((m) => m.user);
    const last = c.messages[0] ?? null;
    const unreadCount = await prisma.chatMessage.count({
      where: {
        conversationId: c.id,
        userId: { not: user.id },
        ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
      },
    });
    const isAgent = c.type === "direct" && others[0]?.accountType === "agent";
    return {
      id: c.id,
      type: c.type,
      name: c.type === "group" ? (c.title ?? "Nhóm") : (others[0]?.name ?? "Người dùng"),
      isAgent,
      isAssistant: isAgent && others[0]?.id === assistantUserId, // trợ lý của chính user → ghim
      participants: c.participants.map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl })),
      lastMessage: last ? { id: last.id, content: last.content, createdAt: last.createdAt, userId: last.userId } : null,
      unreadCount,
      updatedAt: last?.createdAt ?? c.updatedAt,
    };
  }));

  // Trợ lý của tôi luôn ghim trên cùng; còn lại theo thời gian tin mới nhất.
  result.sort((a, b) =>
    (a.isAssistant === b.isAssistant ? 0 : a.isAssistant ? -1 : 1) ||
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return ok(res, result);
}));

// ─── POST /chat/conversations ─────────────────────────────────────────────────

const createConvSchema = z.object({
  type: z.enum(["direct", "group"]),
  participantIds: z.array(z.string().uuid()).min(1),
  title: z.string().max(120).optional(),
});

router.post("/conversations", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const { type, participantIds, title } = createConvSchema.parse(req.body);

  // tập người tham gia (kèm người tạo), bỏ trùng & bỏ chính mình khỏi danh sách nhập
  const others = [...new Set(participantIds.filter((id) => id !== user.id))];
  if (others.length === 0) return badRequest(res, "Cần ít nhất 1 người tham gia khác");
  if (type === "direct" && others.length !== 1) return badRequest(res, "Chat trực tiếp chỉ gồm 2 người");

  // participants phải thuộc công ty & đang hoạt động
  const validCount = await prisma.user.count({
    where: { id: { in: others }, companyId: user.companyId, isActive: true },
  });
  if (validCount !== others.length) return badRequest(res, "Một số người không thuộc công ty bạn");

  // direct: tái dùng hội thoại 1-1 đã có (idempotent)
  if (type === "direct") {
    const otherId = others[0]!;
    const existing = await prisma.chatConversation.findFirst({
      where: {
        companyId: user.companyId,
        type: "direct",
        participants: { every: { userId: { in: [user.id, otherId] } } },
        AND: [
          { participants: { some: { userId: user.id } } },
          { participants: { some: { userId: otherId } } },
        ],
      },
      select: { id: true },
    });
    if (existing) return ok(res, { id: existing.id });
  }

  const allIds = [user.id, ...others];
  const conv = await prisma.chatConversation.create({
    data: {
      companyId: user.companyId,
      type,
      title: type === "group" ? (title ?? null) : null,
      createdBy: user.id,
      participants: { create: allIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });

  // báo realtime cho các thành viên để danh sách hội thoại của họ tự cập nhật
  pushToUsers(others, "chat:conversation", { id: conv.id });
  return created(res, { id: conv.id });
}));

// ─── POST /chat/conversations/:id/participants — thêm thành viên vào nhóm ──────

const addParticipantsSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1),
});

router.post("/conversations/:id/participants", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(req.params["id"]);
  const { participantIds } = addParticipantsSchema.parse(req.body);

  const conv = await prisma.chatConversation.findFirst({
    where: { id, companyId: user.companyId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conv) return notFound(res, "Hội thoại");
  if (conv.type !== "group") return badRequest(res, "Chỉ có thể thêm thành viên cho nhóm");
  if (!conv.participants.some((p) => p.userId === user.id)) {
    return forbidden(res, "Bạn không thuộc hội thoại này");
  }

  // bỏ trùng & bỏ người đã ở trong nhóm
  const existingIds = new Set(conv.participants.map((p) => p.userId));
  const toAdd = [...new Set(participantIds)].filter((uid) => !existingIds.has(uid));
  if (toAdd.length === 0) return ok(res, { added: 0 });

  // người được thêm phải thuộc công ty & đang hoạt động
  const validCount = await prisma.user.count({
    where: { id: { in: toAdd }, companyId: user.companyId, isActive: true },
  });
  if (validCount !== toAdd.length) return badRequest(res, "Một số người không thuộc công ty bạn");

  await prisma.chatParticipant.createMany({
    data: toAdd.map((userId) => ({ conversationId: id, userId })),
    skipDuplicates: true,
  });
  await prisma.chatConversation.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});

  // báo realtime: thành viên mới (hiện hội thoại trong danh sách) + thành viên cũ (cập nhật header)
  pushToUsers([...existingIds, ...toAdd], "chat:conversation", { id });
  return ok(res, { added: toAdd.length });
}));

// ─── GET /chat/conversations/:id/messages ─────────────────────────────────────

router.get("/conversations/:id/messages", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(req.params["id"]);

  const member = await getMembership(id, user.id);
  if (!member) return forbidden(res, "Bạn không thuộc hội thoại này");

  const before = qs(req.query["before"]); // ISO createdAt — lấy tin cũ hơn
  const limit  = Math.min(qi(req.query["limit"], 30), 100);

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarUrl: true, accountType: true } } },
  });

  // trả về theo thứ tự tăng dần để render tự nhiên
  return ok(res, rows.reverse());
}));

// ─── POST /chat/conversations/:id/messages ────────────────────────────────────

const sendSchema = z.object({ content: z.string().min(1).max(4000) });

router.post("/conversations/:id/messages", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(req.params["id"]);
  const { content } = sendSchema.parse(req.body);

  const conv = await prisma.chatConversation.findFirst({
    where: { id, companyId: user.companyId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conv) return notFound(res, "Hội thoại");
  if (!conv.participants.some((p) => p.userId === user.id)) {
    return forbidden(res, "Bạn không thuộc hội thoại này");
  }

  const msg = await prisma.chatMessage.create({
    data: { conversationId: id, userId: user.id, content: content.trim() },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  // chạm updatedAt để sort danh sách (đồng thời đánh dấu người gửi đã đọc tới đây)
  await prisma.chatConversation.update({ where: { id }, data: { updatedAt: new Date() } }).catch(() => {});
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data:  { lastReadAt: new Date() },
  }).catch(() => {});

  const memberIds = conv.participants.map((p) => p.userId);
  const others    = memberIds.filter((uid) => uid !== user.id);

  // 1. SSE realtime tới TẤT CẢ thành viên (client tự dedupe theo msg.id cho đa-tab)
  pushToUsers(memberIds, "chat:message", { conversationId: id, message: msg });

  // 2. Web push CHỈ tới người đang offline (không mở app) để tránh làm phiền người đang chat
  const offline = others.filter((uid) => !isOnline(uid));
  if (offline.length > 0) {
    const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
    void sendPushToUsers(offline, {
      title: conv.type === "group" ? (conv.title ?? "Tin nhắn nhóm") : user.name,
      body:  conv.type === "group" ? `${user.name}: ${preview}` : preview,
      tag:   `chat:${id}`,
      data:  { url: `/chat?c=${id}` },
    });
  }

  // Nếu hội thoại có AI agent → agent tự trả lời (chạy nền, không chặn response)
  void maybeTriggerAgentReply(
    id, user.companyId,
    { id: user.id, accountType: user.accountType, roleName: user.roleName, roleLevel: user.roleLevel },
    content.trim(),
  );

  return created(res, msg);
}));

// ─── POST /chat/conversations/:id/read ────────────────────────────────────────

router.post("/conversations/:id/read", requireAuth, wrap(async (req, res) => {
  const user = req.user!;
  const id   = param(req.params["id"]);

  const member = await getMembership(id, user.id);
  if (!member) return forbidden(res, "Bạn không thuộc hội thoại này");

  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data:  { lastReadAt: new Date() },
  });
  return ok(res, { read: true });
}));

// ─── GET /chat/stream — SSE ───────────────────────────────────────────────────

router.get("/stream", requireAuth, (req, res) => {
  const user = req.user!;

  res.writeHead(200, {
    "Content-Type":      "text/event-stream",
    "Cache-Control":     "no-cache, no-transform",
    "Connection":        "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);

  const cleanup   = addClient(user.id, res);
  const keepalive = startKeepalive(res);

  req.on("close", () => {
    clearInterval(keepalive);
    cleanup();
    res.end();
  });
});

export default router;
