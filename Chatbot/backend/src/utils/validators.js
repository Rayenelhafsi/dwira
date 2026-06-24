import { z } from "zod";

const chatAttachmentSchema = z.object({
  type: z.enum(["image", "document", "file"]).default("image"),
  url: z.string().min(1).optional(),
  dataUrl: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!String(value.url || "").trim() && !String(value.dataUrl || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "attachment url or dataUrl is required",
      path: ["url"],
    });
  }
});

export const chatSchema = z.object({
  platform: z.enum(["website", "whatsapp", "messenger", "instagram"]),
  platformUserId: z.string().min(1),
  message: z.string().optional().default(""),
  attachments: z.array(chatAttachmentSchema).optional().default([]),
}).superRefine((value, ctx) => {
  const hasMessage = String(value.message || "").trim().length > 0;
  const hasAttachments = Array.isArray(value.attachments) && value.attachments.length > 0;
  if (!hasMessage && !hasAttachments) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "message or attachments is required",
      path: ["message"],
    });
  }
});

export const chatSessionSchema = z.object({
  platform: z.enum(["website", "whatsapp", "messenger", "instagram"]),
  platformUserId: z.string().min(1),
});

export const feedbackLearningSchema = z.object({
  question: z.string().trim().min(1),
  botAnswer: z.string().trim().optional().default(""),
  correctedAnswer: z.string().trim().optional().nullable().default(null),
  reason: z.string().trim().optional().nullable().default(null),
});
