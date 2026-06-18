// src/lib/api/client.ts
// Client-side API helpers — gọi Express API qua proxy /api/*.
// Chuẩn hoá việc parse envelope { success, data, meta } + xử lý lỗi đồng nhất.

import { useCallback, useEffect, useState } from "react";

export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  // Số lượng việc theo nhóm tiến độ (sub-tab): đang thực hiện (đúng hạn) / quá hạn / hoàn thành.
  counts?: { in_progress: number; overdue: number; completed: number };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: ApiMeta;
  error?: { code?: string; message?: string };
}

/**
 * Gọi API và trả về { data, meta }. Throw ApiError nếu HTTP lỗi hoặc success=false.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; meta: ApiMeta | null }> {
  const res = await fetch(path, init);

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // Response không phải JSON
  }

  if (!res.ok || json?.success === false) {
    const message = json?.error?.message ?? `Yêu cầu thất bại (${res.status})`;
    throw new ApiError(res.status, message, json?.error?.code);
  }

  return { data: (json?.data ?? null) as T, meta: json?.meta ?? null };
}

/** POST/PUT/PATCH helper — tự set Content-Type + serialize JSON. */
export function apiSend<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ data: T; meta: ApiMeta | null }> {
  return apiFetch<T>(path, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

export interface UseApiResult<T> {
  data: T | null;
  meta: ApiMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook tải dữ liệu GET. Tự fetch khi mount và khi `path` đổi.
 * - `path === null` → bỏ qua fetch (dùng cho điều kiện chưa sẵn sàng).
 * - `loading`: lần tải đầu / khi path đổi. `refreshing`: gọi refresh() thủ công.
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Khi path đổi: xóa dữ liệu cũ NGAY trong render (trước khi effect fetch chạy),
  // để consumer không bao giờ thấy data của path trước — tránh map sai shape khi
  // đổi tab (vd: WorkItem[] bị ép kiểu Project[] → đọc manager.name của undefined).
  const [prevPath, setPrevPath] = useState(path);
  const stale = path !== prevPath;
  if (stale) {
    setPrevPath(path);
    setData(null);
    setMeta(null);
    setError(null);
    setLoading(true);
  }

  const run = useCallback(
    async (mode: "load" | "refresh") => {
      if (path === null) {
        setLoading(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<T>(path);
        setData(result.data);
        setMeta(result.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path]
  );

  useEffect(() => {
    void run("load");
  }, [run]);

  const refresh = useCallback(() => void run("refresh"), [run]);

  // Khi `path` vừa đổi, setState ở trên mới chỉ LÊN LỊCH re-render — lần render hiện
  // tại vẫn chạy tiếp với data của path cũ. Trả về giá trị "đã reset" ngay để consumer
  // không map nhầm data sai shape (vd RecurringItem[] bị ép Project[] → đọc _count.members
  // của undefined) trước khi React render lại.
  if (stale) {
    return { data: null, meta: null, loading: true, refreshing: false, error: null, refresh };
  }

  return { data, meta, loading, refreshing, error, refresh };
}
