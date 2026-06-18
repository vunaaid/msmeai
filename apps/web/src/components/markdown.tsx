"use client";

// src/components/markdown.tsx
// Renderer markdown gọn nhẹ, KHÔNG phụ thuộc thư viện (dark theme).
// Hỗ trợ: heading, đậm/nghiêng, inline code, code block, list, link, hr.

import React from "react";

function renderInline(text: string, kb: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    if (m.index > last) out.push(text.slice(last, m.index));
    if (tok.startsWith("`")) {
      out.push(<code key={`${kb}${i}`} className="bg-slate-800 px-1 py-0.5 rounded text-[0.85em] text-cyan-300">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={`${kb}${i}`} className="font-semibold text-white">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={`${kb}${i}`}>{tok.slice(1, -1)}</em>);
    } else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (lm) out.push(<a key={`${kb}${i}`} href={lm[2]} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{lm[1]}</a>);
      else out.push(tok);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const SPECIAL = /^\s*(#{1,6}\s|[-*]\s|\d+\.\s|```|-{3,}\s*$|\*{3,}\s*$)/;

export function Markdown({ children, className }: { children: string; className?: string }) {
  const lines = (children ?? "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code block
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) { buf.push(lines[i] ?? ""); i++; }
      i++; // bỏ dòng đóng ```
      blocks.push(<pre key={k++} className="bg-slate-800 rounded-lg p-3 overflow-auto text-xs my-2"><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push(<hr key={k++} className="border-slate-700 my-2" />); i++; continue; }
    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = (h[1] ?? "#").length;
      const txt = h[2] ?? "";
      const cls = lvl <= 1 ? "text-base font-bold text-white mt-2 mb-1"
        : lvl === 2 ? "text-sm font-bold text-white mt-2 mb-1"
        : "text-sm font-semibold text-slate-100 mt-1.5";
      blocks.push(<div key={k} className={cls}>{renderInline(txt, `h${k++}_`)}</div>);
      i++; continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, "")); i++; }
      const gk = k++;
      blocks.push(<ul key={gk} className="list-disc pl-5 space-y-0.5 my-1">{items.map((it, idx) => <li key={idx} className="text-slate-200">{renderInline(it, `ul${gk}_${idx}_`)}</li>)}</ul>);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, "")); i++; }
      const gk = k++;
      blocks.push(<ol key={gk} className="list-decimal pl-5 space-y-0.5 my-1">{items.map((it, idx) => <li key={idx} className="text-slate-200">{renderInline(it, `ol${gk}_${idx}_`)}</li>)}</ol>);
      continue;
    }
    // Blank
    if (line.trim() === "") { i++; continue; }
    // Paragraph
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !SPECIAL.test(lines[i] ?? "")) { para.push(lines[i] ?? ""); i++; }
    blocks.push(<p key={k} className="text-slate-200 leading-relaxed my-1">{renderInline(para.join(" "), `p${k++}_`)}</p>);
  }

  return <div className={`space-y-1 break-words ${className ?? ""}`}>{blocks}</div>;
}
