import { Router } from "express";
import { metaVerifyController, metaWebhookController } from "../../controllers/webhook.controller.js";

const router = Router();
router.get("/webhook/meta", metaVerifyController);
router.post("/webhook/meta", metaWebhookController);
export default router;
