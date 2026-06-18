// src/app/api/[...proxy]/route.ts
// Proxy tất cả /api/* → Express API tại EXPRESS_API_URL
// /api/auth/* được xử lý bởi NextAuth — KHÔNG đi qua đây (route cụ thể hơn)

import { type NextRequest, NextResponse } from "next/server";

const EXPRESS_API = process.env["EXPRESS_API_URL"] ?? "http://localhost:4000";

type Context = { params: Promise<{ proxy: string[] }> };

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

// Headers không được forward nguyên trạng vì fetch đã giải mã/đổi độ dài body.
const SKIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

function buildTargetUrl(req: NextRequest, proxy: string[]): string {
  const path = proxy.join("/");
  const search = req.nextUrl.search ?? "";
  return `${EXPRESS_API}/api/${path}${search}`;
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers();

  // Forward auth + content headers
  for (const key of ["cookie", "authorization", "content-type"]) {
    const val = req.headers.get(key);
    if (val) headers.set(key, val);
  }

  // Forward real IP
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (ip) headers.set("x-forwarded-for", ip);

  headers.set("x-forwarded-host", req.headers.get("host") ?? "");
  headers.set("x-proxy", "vsme-web");

  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  // set-cookie có thể có nhiều giá trị — forEach gộp lại sai, dùng getSetCookie.
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of setCookies) headers.append("set-cookie", cookie);
  }

  return headers;
}

async function proxyRequest(req: NextRequest, proxy: string[]): Promise<Response> {
  const targetUrl = buildTargetUrl(req, proxy);
  const body = METHODS_WITH_BODY.has(req.method)
    ? Buffer.from(await req.arrayBuffer())
    : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: buildForwardHeaders(req),
      body,
      redirect: "manual",
      // @ts-expect-error — Node.js fetch hỗ trợ duplex cho streaming body
      duplex: "half",
    });

    // SSE streaming → trả thẳng body stream
    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 101/204/205/304 bắt buộc body = null (Response constructor throw nếu kèm body,
    // kể cả ArrayBuffer rỗng) — vd DELETE trả 204 trước đây gây 502.
    const nullBody = upstream.status === 101 || upstream.status === 204
      || upstream.status === 205 || upstream.status === 304;
    return new Response(nullBody ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: buildResponseHeaders(upstream),
    });
  } catch (err) {
    console.error(`[proxy] ${req.method} ${targetUrl} →`, err);
    return NextResponse.json(
      { success: false, error: { code: "PROXY_ERROR", message: "API server không phản hồi" } },
      { status: 502 }
    );
  }
}

async function handler(req: NextRequest, ctx: Context): Promise<Response> {
  const { proxy } = await ctx.params;
  return proxyRequest(req, proxy);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
