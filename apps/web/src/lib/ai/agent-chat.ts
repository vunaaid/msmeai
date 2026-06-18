// src/lib/ai/agent-chat.ts
// Gửi tin nhắn tới AI agent qua SSE: POST /api/ai/agents/:agentId/chat
// Dùng chung cho trang chat agent + panel Trợ lý AI.

export interface AgentChatHandlers {
  onSession?: (sessionId: string, isNew: boolean) => void;
  onText: (chunk: string) => void;
}

/** Stream phản hồi của agent. Throw nếu lỗi (HTTP hoặc event error). */
export async function streamAgentChat(
  agentId: string,
  message: string,
  sessionId: string | null,
  handlers: AgentChatHandlers
): Promise<void> {
  const res = await fetch(`/api/ai/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: sessionId ?? undefined }),
  });

  if (!res.ok || !res.body) {
    let msg = "Lỗi khi gửi tin nhắn";
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? msg;
    } catch {
      /* không phải JSON */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      let event = "message";
      let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (event === "session") {
        handlers.onSession?.(data["sessionId"] as string, !!data["isNew"]);
      } else if (event === "text") {
        const t = data["text"] as string | undefined;
        if (t) handlers.onText(t);
      } else if (event === "error") {
        const e = data["error"];
        streamError = typeof e === "string" ? e : "Lỗi khi xử lý yêu cầu";
      }
    }
  }

  if (streamError) throw new Error(streamError);
}
