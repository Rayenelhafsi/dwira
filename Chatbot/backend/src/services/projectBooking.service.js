import { config } from "../config/env.js";

function apiBase() {
  return String(process.env.PROJECT_API_BASE || "http://127.0.0.1:3001/api").replace(/\/+$/, "");
}

export async function createReservationDemandFromChat(payload) {
  const response = await fetch(`${apiBase()}/reservation-demands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(String(data?.error || `Reservation demand creation failed (${response.status})`));
  }
  return data;
}

export async function listReservationDemandsByPhone(phone) {
  const normalizedPhone = String(phone || "").replace(/\s+/g, "").trim();
  if (!normalizedPhone) return [];
  const url = new URL(`${apiBase()}/reservation-demands`);
  url.searchParams.set("phone", normalizedPhone);
  url.searchParams.set("limit", "5");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) return [];
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
