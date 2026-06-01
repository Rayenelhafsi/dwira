import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8090),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "replace_me",
  redisUrl: process.env.REDIS_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
  openaiEmbedModel: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  qdrantUrl: process.env.QDRANT_URL,
  qdrantApiKey: process.env.QDRANT_API_KEY,
  qdrantCollection: process.env.QDRANT_COLLECTION || "chatbot_knowledge",
  qdrantPropertyCollection: process.env.QDRANT_PROPERTY_COLLECTION || "chatbot_properties",
  hybridSearchEnabled: String(process.env.HYBRID_SEARCH_ENABLED || "true").toLowerCase() === "true",
  hybridCandidateLimit: Number(process.env.HYBRID_CANDIDATE_LIMIT || 80),
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
    whatsappPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID,
  },
  websiteMeta: {
    pixelId: process.env.META_CAPI_PIXEL_ID,
    vitePixelId: process.env.VITE_META_PIXEL_ID,
    capiAccessToken: process.env.META_CAPI_ACCESS_TOKEN,
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE,
  },
};
