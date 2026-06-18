import type { NextConfig } from "next";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Next.js chỉ tự nạp .env trong thư mục app (apps/web). Repo này dùng .env DUY NHẤT ở root,
// nên các biến NEXT_PUBLIC_* (vd NEXT_PUBLIC_VAPID_PUBLIC_KEY) KHÔNG được inline vào bundle
// client lúc build → undefined ở trình duyệt. Nạp thủ công root .env vào process.env trước khi
// build để Next inline đúng. Biến đã có sẵn (shell/pm2) được giữ nguyên (không ghi đè).
(() => {
  const rootEnv = join(process.cwd(), "../../.env");
  if (!existsSync(rootEnv)) return;
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@vsme/db", "@vsme/modules", "@vsme/audit", "@vsme/ai-sdk", "@vsme/llm"],

  // Server external packages (Node.js only)
  serverExternalPackages: ["bcryptjs", "bullmq", "nodemailer", "minio", "@prisma/client"],

  experimental: {
    // Tối ưu bundle size
    optimizePackageImports: ["lucide-react"],
  },

  // Resolve .js → .ts for ESM TypeScript workspace packages
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // X-Frame-Options do nginx gateway set (SAMEORIGIN) — KHÔNG set ở đây để tránh
          // header trùng/xung đột (DENY+SAMEORIGIN → DENY) chặn iframe cùng-origin (PDF viewer /preview).
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },

  // Rewrites cho API proxy (nếu cần)
  async rewrites() {
    return [];
  },
};

export default nextConfig;
