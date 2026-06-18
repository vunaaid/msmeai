// packages/db/src/gl-service.ts
// Service dùng chung tạo bút toán kép (GL). Dùng bởi cả API (gl.router) lẫn
// AI SDK (tool create_journal_entry). Resolve tài khoản theo id HOẶC mã (code),
// validate Nợ = Có, chỉ cho hạch toán vào TK lá đang hoạt động.

import { prisma } from "./client";

export interface GlLineInput {
  accountId?: string;
  accountCode?: string; // VD: "1111", "4111" — tiện cho AI agent
  debit?: number;
  credit?: number;
  description?: string;
}

export interface CreateJournalEntryInput {
  companyId: string;
  createdBy: string; // userId người tạo
  date: string; // YYYY-MM-DD
  description?: string;
  journalId?: string;
  journalCode?: string; // mặc định: nhật ký chung
  lines: GlLineInput[];
  status?: "draft" | "pending"; // mặc định draft
  sourceModule?: string; // VD: "ai-agent" — nguồn phát sinh
  sourceRef?: string; // VD: workItemId — để duyệt/rollback theo công việc
}

export interface CreatedEntry {
  id: string;
  number: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
}

export type CreateJournalEntryResult =
  | { ok: true; entry: CreatedEntry }
  | { ok: false; error: string };

const cents = (n: number) => Math.round(n * 100);

/** Tạo bút toán. Trả về kết quả discriminated (không throw cho lỗi nghiệp vụ). */
export async function createJournalEntry(
  input: CreateJournalEntryInput,
): Promise<CreateJournalEntryResult> {
  const { companyId, createdBy } = input;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "Ngày phải dạng YYYY-MM-DD" };
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    return { ok: false, error: "Cần ít nhất 2 dòng bút toán" };
  }

  // 1) Resolve nhật ký
  let journal =
    (input.journalId
      ? await prisma.journal.findFirst({ where: { id: input.journalId, companyId } })
      : input.journalCode
        ? await prisma.journal.findUnique({ where: { companyId_code: { companyId, code: input.journalCode } } })
        : null);
  if (!journal) {
    journal =
      (await prisma.journal.findFirst({ where: { companyId, type: "general" } })) ??
      (await prisma.journal.findFirst({ where: { companyId } }));
  }
  if (!journal) {
    return { ok: false, error: "Chưa có sổ nhật ký — cần khởi tạo danh mục GL (seed TT200) trước." };
  }

  // 2) Resolve & validate từng dòng
  let totalDebit = 0;
  let totalCredit = 0;
  const resolved: { accountId: string; debit: number; credit: number; description: string | null }[] = [];

  for (const ln of input.lines) {
    const debit = Number(ln.debit ?? 0);
    const credit = Number(ln.credit ?? 0);
    if (debit < 0 || credit < 0) return { ok: false, error: "Số tiền không được âm" };
    if ((debit > 0) === (credit > 0)) {
      return { ok: false, error: "Mỗi dòng phải có Nợ HOẶC Có (không đồng thời, khác 0)" };
    }

    const acc =
      (ln.accountId
        ? await prisma.glAccount.findFirst({ where: { id: ln.accountId, companyId } })
        : ln.accountCode
          ? await prisma.glAccount.findUnique({ where: { companyId_code: { companyId, code: ln.accountCode } } })
          : null);
    if (!acc) return { ok: false, error: `Không tìm thấy tài khoản: ${ln.accountCode ?? ln.accountId ?? "(trống)"}` };
    if (!acc.isLeaf) return { ok: false, error: `TK ${acc.code} là TK tổng hợp — không hạch toán trực tiếp` };
    if (!acc.isActive) return { ok: false, error: `TK ${acc.code} đã bị khóa` };

    totalDebit += debit;
    totalCredit += credit;
    resolved.push({ accountId: acc.id, debit, credit, description: ln.description ?? null });
  }

  if (cents(totalDebit) !== cents(totalCredit)) {
    return { ok: false, error: `Tổng Nợ (${totalDebit}) phải bằng tổng Có (${totalCredit})` };
  }
  if (cents(totalDebit) === 0) {
    return { ok: false, error: "Tổng phát sinh phải lớn hơn 0" };
  }

  // 3) Sinh số bút toán BT{year}-{seq}
  const date = new Date(input.date);
  const year = date.getUTCFullYear();
  const prefix = `BT${year}-`;
  const count = await prisma.journalEntry.count({ where: { companyId, number: { startsWith: prefix } } });
  const number = `${prefix}${String(count + 1).padStart(3, "0")}`;

  const status = input.status === "pending" ? "pending" : "draft";

  const entry = await prisma.journalEntry.create({
    data: {
      companyId,
      journalId: journal.id,
      number,
      date,
      description: input.description ?? null,
      status,
      totalDebit,
      totalCredit,
      createdBy,
      sourceModule: input.sourceModule ?? null,
      sourceRef: input.sourceRef ?? null,
      lines: {
        create: resolved.map((l, i) => ({
          accountId: l.accountId,
          lineNo: i + 1,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      },
    },
    select: { id: true, number: true, status: true, totalDebit: true, totalCredit: true },
  });

  return {
    ok: true,
    entry: {
      id: entry.id,
      number: entry.number,
      status: entry.status,
      totalDebit: Number(entry.totalDebit),
      totalCredit: Number(entry.totalCredit),
    },
  };
}
