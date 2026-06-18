// src/app.ts
// Express app factory — cấu hình middleware và routes

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";

import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";

// Module routers
import usersRouter        from "./modules/users/users.router.js";
import rolesRouter        from "./modules/roles/roles.router.js";
import workRouter         from "./modules/work/work.router.js";
import recurringRouter    from "./modules/work/recurring.router.js";
import projectsRouter     from "./modules/projects/projects.router.js";
import adminRouter        from "./modules/admin/admin.router.js";
import aiRouter           from "./modules/ai/ai.router.js";
import notificationsRouter from "./modules/notifications/notifications.router.js";
import pushRouter         from "./modules/push/push.router.js";
import claudeCliRouter    from "./modules/claude-cli/claude-cli.router.js";
import authRouter         from "./modules/auth/auth.router.js";
import signupRouter       from "./modules/auth/signup.router.js";
import documentsRouter    from "./modules/documents/documents.router.js";
import foldersRouter      from "./modules/folders/folders.router.js";
import notesRouter        from "./modules/notes/notes.router.js";
import chatRouter         from "./modules/chat/chat.router.js";
import glRouter           from "./modules/gl/gl.router.js";
import contractsRouter    from "./modules/contracts/contracts.router.js";
import hrRouter            from "./modules/hr/hr.router.js";
import partnersRouter      from "./modules/partners/partners.router.js";
import debtsRouter         from "./modules/debts/debts.router.js";
import cashRouter          from "./modules/cash/cash.router.js";
import assetsRouter        from "./modules/assets/assets.router.js";
import salesRouter         from "./modules/sales/sales.router.js";
import inventoryRouter     from "./modules/inventory/inventory.router.js";
import expensesRouter      from "./modules/expenses/expenses.router.js";
import taxRouter           from "./modules/tax/tax.router.js";
import reportsRouter       from "./modules/reports/reports.router.js";

// ─── CORS origins ────────────────────────────────────────────────────────────

const ROOT_DOMAIN   = process.env["NEXT_PUBLIC_ROOT_DOMAIN"] ?? "example.com";
const APP_URL       = process.env["APP_URL"] ?? `https://sme.${ROOT_DOMAIN}`;

const CORS_ORIGINS = [
  APP_URL,
  `https://*.${ROOT_DOMAIN}`,
  // Dev
  "http://localhost:3000",
  "http://localhost:3001",
];

export function createApp() {
  const app = express();

  // ─── Core middleware ────────────────────────────────────────────────────────
  app.use(compression());
  app.use(morgan(process.env["NODE_ENV"] === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / non-browser
      const isAllowed = CORS_ORIGINS.some(o => {
        if (o.includes("*")) {
          const pattern = new RegExp("^" + o.replace("*.", "([a-zA-Z0-9-]+\\.)?") + "$");
          return pattern.test(origin);
        }
        return o === origin;
      });
      cb(isAllowed ? null : new Error(`CORS blocked: ${origin}`), isAllowed);
    },
    credentials: true,
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }));

  // ─── Auth middleware (global — gắn req.user nếu có token) ──────────────────
  app.use(authMiddleware);

  // ─── Health check ───────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  // ─── API routes ─────────────────────────────────────────────────────────────
  const api = express.Router();

  api.use("/auth",          authRouter);       // public — trước authMiddleware
  api.use("/signup",        signupRouter);      // public — đăng ký dùng thử (Phase 2)
  api.use("/users",         usersRouter);
  api.use("/roles",         rolesRouter);
  api.use("/work",          workRouter);
  api.use("/recurring",     recurringRouter);
  api.use("/projects",      projectsRouter);
  api.use("/admin",         adminRouter);
  api.use("/ai",            aiRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/push",          pushRouter);
  api.use("/claude-cli",    claudeCliRouter);
  api.use("/documents",     documentsRouter);
  api.use("/folders",       foldersRouter);
  api.use("/notes",         notesRouter);
  api.use("/chat",          chatRouter);
  api.use("/gl",            glRouter);
  api.use("/contracts",     contractsRouter);
  api.use("/hr",            hrRouter);
  api.use("/partners",      partnersRouter);
  api.use("/debts",         debtsRouter);
  api.use("/cash",          cashRouter);
  api.use("/assets",        assetsRouter);
  api.use("/sales",         salesRouter);
  api.use("/inventory",     inventoryRouter);
  api.use("/expenses",      expensesRouter);
  api.use("/tax",           taxRouter);
  api.use("/reports",       reportsRouter);

  app.use("/api", api);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route không tồn tại" } });
  });

  // ─── Global error handler (MUST be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
