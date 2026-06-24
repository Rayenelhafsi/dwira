import { prisma } from "../config/prisma.js";

let ensurePromise = null;

async function createChatbotTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER NOT NULL AUTO_INCREMENT,
      platform VARCHAR(191) NOT NULL,
      platform_user_id VARCHAR(191) NOT NULL,
      full_name VARCHAR(191) NULL,
      phone VARCHAR(191) NULL,
      language VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY clients_platform_platform_user_id_key (platform, platform_user_id),
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER NOT NULL AUTO_INCREMENT,
      client_id INTEGER NOT NULL,
      state VARCHAR(191) NOT NULL,
      is_human_takeover BOOLEAN NOT NULL DEFAULT false,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      INDEX idx_conversations_client_id (client_id),
      CONSTRAINT conversations_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER NOT NULL AUTO_INCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_type ENUM('client', 'bot', 'admin') NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      INDEX idx_messages_conversation_id (conversation_id),
      CONSTRAINT messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS feedback_learning (
      id INTEGER NOT NULL AUTO_INCREMENT,
      question TEXT NOT NULL,
      bot_answer TEXT NOT NULL,
      corrected_answer TEXT NULL,
      reason TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS intent_dictionary (
      id INTEGER NOT NULL AUTO_INCREMENT,
      phrase VARCHAR(191) NOT NULL,
      meaning VARCHAR(191) NOT NULL,
      search_filter VARCHAR(191) NOT NULL,
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function ensureChatbotSchema() {
  if (!ensurePromise) {
    ensurePromise = createChatbotTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
