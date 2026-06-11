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

fs.mkdirSync(chatbotMediaDir, { recursive: true });

app.use(helmet());
app.use(cors());
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
