import { Router } from "express";
import { chatController, chatSyncController } from "../../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.post("/chat", chatController);
router.post("/chat/sync", chatSyncController);
router.post("/chat/admin", requireAuth, chatController);
export default router;
