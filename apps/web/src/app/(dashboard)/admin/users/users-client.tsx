"use client";

// src/app/(dashboard)/admin/users/users-client.tsx

import { useState, useEffect } from "react";
import {
  Search, UserPlus, RefreshCw, Shield, Phone, Bot,
  Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { AddUserModal } from "./add-user-modal";
import { EditUserModal } from "./edit-user-modal";
import { useApi } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";

interface Role {
  id: string;
  name: string;
  level: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: Role | null;
  manager: { id: string; name: string } | null;
  accountType: "system_admin" | "company_admin" | "user" | "agent";
}

function UserInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials = parts.length >= 2
    ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  return (
    <div className="w-8 h-8 rounded-full bg-cyan-600/30 border border-cyan-600/50 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-semibold text-cyan-300">{initials}</span>
    </div>
  );
}

function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="border-2 border-slate-700 border-t-cyan-500 rounded-full animate-spin"
    />
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function UsersClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const limit = 20;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }).toString();

  const { data, meta, loading, refreshing, error, refresh } =
    useApi<User[]>(`/api/users?${query}`);
  const users = data ?? [];
  const total = meta?.total ?? users.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div className="max-w-[1600px] mx-auto space-y-5">
        {/* Header */}
        <PageHeader
          backHref="/admin"
          title="Quản Lý Người Dùng"
          subtitle={
            <>
              Thêm, sửa, phân quyền người dùng trong công ty
              {total > 0 && <span className="ml-2 text-slate-500">· {total} người dùng</span>}
            </>
          }
          actions={
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <UserPlus size={15} />
              Thêm người dùng
            </button>
          }
        />

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-slate-800">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên, email..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200
                           placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all"
              />
            </div>
            <button
              onClick={refresh}
              disabled={refreshing || loading}
              title="Tải lại"
              className="p-2 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Spinner size={32} />
                <p className="text-sm text-slate-500">Đang tải người dùng...</p>
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
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <UserPlus size={20} className="text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">
                {debouncedSearch ? "Không tìm thấy người dùng phù hợp" : "Chưa có người dùng nào"}
              </p>
              {!debouncedSearch && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
                >
                  Thêm người dùng đầu tiên
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/40">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">
                        Người dùng
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Vai trò
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                        Cấp trên
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">
                        Điện thoại
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                        Đăng nhập cuối
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Trạng thái
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        onClick={() => setEditId(user.id)}
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      >
                        {/* Avatar + Info */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <UserInitials name={user.name} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate flex items-center gap-1.5">
                                {user.name}
                                {user.isSuperAdmin && (
                                  <Shield size={11} className="text-amber-400 flex-shrink-0" />
                                )}
                                {user.accountType === "agent" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 flex-shrink-0">
                                    <Bot size={9} /> AI
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3.5">
                          {user.role ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {user.role.name}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>

                        {/* Manager */}
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          {user.manager ? (
                            <span className="text-xs text-slate-300">{user.manager.name}</span>
                          ) : (
                            <span className="text-xs text-slate-600">— (cấp cao nhất)</span>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          {user.phone ? (
                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Phone size={11} className="text-slate-600" />
                              {user.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>

                        {/* Last login */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock size={11} className="text-slate-600" />
                            {formatDate(user.lastLoginAt)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center">
                          {user.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle2 size={13} />
                              Hoạt động
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400">
                              <XCircle size={13} />
                              Vô hiệu
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800">
                  <p className="text-xs text-slate-500">
                    Trang {page} / {totalPages} · {total} người dùng
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={refresh}
      />

      <EditUserModal
        open={editId !== null}
        userId={editId}
        onClose={() => setEditId(null)}
        onSuccess={refresh}
      />
    </>
  );
}
