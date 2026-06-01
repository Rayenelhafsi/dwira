import axios from "axios";
import { config } from "../../config/env.js";

export async function sendMetaMessage(recipientId, text) {
  if (!config.meta.pageAccessToken) return;
  await axios.post(
    "https://graph.facebook.com/v20.0/me/messages",
    {
      recipient: { id: recipientId },
      message: { text },
    },
    {
      params: { access_token: config.meta.pageAccessToken },
    }
  );
}
