import express from "express";
import cors from "cors";
import helmet from "helmet";
import chatRoutes from "./api/routes/chat.routes.js";
import webhookRoutes from "./api/routes/webhook.routes.js";
import coreRoutes from "./api/routes/core.routes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(chatRoutes);
app.use(webhookRoutes);
app.use(coreRoutes);

export default app;
