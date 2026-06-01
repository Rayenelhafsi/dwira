import { z } from "zod";

export const chatSchema = z.object({
  platform: z.enum(["website", "whatsapp", "messenger", "instagram"]),
  platformUserId: z.string().min(1),
  message: z.string().min(1),
});
