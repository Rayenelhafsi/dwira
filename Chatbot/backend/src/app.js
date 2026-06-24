import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chatRoutes from "./api/routes/chat.routes.js";
import webhookRoutes from "./api/routes/webhook.routes.js";
import coreRoutes from "./api/routes/core.routes.js";
import debugRoutes from "./api/routes/debug.routes.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatbotMediaDir = path.resolve(__dirname, "..", "uploads", "chatbot-media");
const configuredOrigins = [
  process.env.WEB_ORIGIN,
  process.env.WEBSITE_BASE_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://www.dwiraimmobilier.com",
  "https://dwiraimmobilier.com",
]
  .map((value) => String(value || "").trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowedOrigins = Array.from(new Set(configuredOrigins));

const corsOptions = {
  origin(origin, callback) {
    const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");
    if (!normalizedOrigin) return callback(null, true);
    if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
    return callback(new Error(`origin_not_allowed:${normalizedOrigin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

fs.mkdirSync(chatbotMediaDir, { recursive: true });

app.use(helmet());
app.use(cors(corsOptions));
app.use(
  express.json({
    limit: process.env.CHATBOT_UPLOAD_BODY_LIMIT || "15mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/chatbot-media", express.static(chatbotMediaDir));
app.use(chatRoutes);
app.use(webhookRoutes);
app.use(coreRoutes);
if (String(process.env.NODE_ENV || "development").toLowerCase() !== "production") {
  app.use(debugRoutes);
}

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    return res.status(413).json({
      error: "attachment_too_large",
      message: "Attachment payload too large.",
    });
  }
  return next(error);
});

export default app;
