import { config } from "../config/env.js";
import { prisma } from "../config/prisma.js";

function apiBase() {
  return String(process.env.PROJECT_API_BASE || "http://127.0.0.1:3001/api").replace(/\/+$/, "");
}

const AGENCY_TIME_ZONE = "Africa/Tunis";

function adminHeaders(extra = {}) {
  const email = String(process.env.PROJECT_ADMIN_EMAIL || "").trim();
  const password = String(process.env.PROJECT_ADMIN_PASSWORD || "").trim();
  const headers = { ...extra };
  if (email && password) {
    headers["x-admin-email"] = email;
    headers["x-admin-password"] = password;
  }
  return headers;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generatedEmailFromProfile(profile) {
  const phoneDigits = normalizePhone(profile?.phone).replace(/\D+/g, "");
  const cin = String(profile?.identityNumber || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (phoneDigits) return `chatbot-${phoneDigits}@dwira.local`;
  if (cin) return `chatbot-${cin}@dwira.local`;
  return `chatbot-${Date.now()}@dwira.local`;
}

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sqlDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENCY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  let hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  const second = parts.find((part) => part.type === "second")?.value || "00";
  if (hour === "24") hour = "00";
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function sqlDateOnly(value) {
  const raw = String(value || "").trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const parsed = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENCY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

async function parseJsonResponse(response, fallbackLabel) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text } : null;
  }
  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || `${fallbackLabel} (${response.status})`));
  }
  return data;
}

async function fetchProjectUserById(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, nom, email, telephone, address, cin, cin_image_url
     FROM dwira.utilisateurs
     WHERE id = ?
     LIMIT 1`,
    normalizedUserId
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findExistingProjectUser(profile) {
  const email = normalizeEmail(profile?.email);
  const phoneDigits = normalizePhone(profile?.phone).replace(/\D+/g, "");
  const cin = String(profile?.identityNumber || "").trim();
  if (email) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, nom, email, telephone, address, cin, cin_image_url FROM dwira.utilisateurs WHERE LOWER(TRIM(email)) = ? ORDER BY created_at DESC LIMIT 1`,
      email
    );
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  if (phoneDigits.length >= 8) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, nom, email, telephone, address, cin, cin_image_url
       FROM dwira.utilisateurs
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telephone,''),'+',''),' ',''),'-',''),'.','') LIKE ?
       ORDER BY created_at DESC
       LIMIT 1`,
      `%${phoneDigits}%`
    );
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  if (cin) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, nom, email, telephone, address, cin, cin_image_url FROM dwira.utilisateurs WHERE TRIM(COALESCE(cin,'')) = ? ORDER BY created_at DESC LIMIT 1`,
      cin
    );
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
}

export async function upsertProjectUserFromChat(profile) {
  const fullName = String(profile?.fullName || "").trim();
  const phone = normalizePhone(profile?.phone);
  const email = normalizeEmail(profile?.email) || generatedEmailFromProfile(profile);
  const address = String(profile?.address || "").trim() || null;
  const cin = String(profile?.identityNumber || "").trim() || null;
  const cinImageUrl = String(profile?.identityImageUrl || "").trim() || null;

  if (!fullName || !phone) {
    throw new Error("Missing profile full name or phone for project user upsert");
  }

  const existing = await findExistingProjectUser({ ...profile, email, phone, identityNumber: cin });
  const now = sqlDateTime();

  if (existing?.id) {
    await prisma.$executeRawUnsafe(
      `UPDATE dwira.utilisateurs
       SET nom = COALESCE(NULLIF(?, ''), nom),
           email = COALESCE(NULLIF(?, ''), email),
           telephone = COALESCE(NULLIF(?, ''), telephone),
           address = COALESCE(NULLIF(?, ''), address),
           client_type = 'locataire',
           cin = COALESCE(NULLIF(?, ''), cin),
           cin_image_url = COALESCE(NULLIF(?, ''), cin_image_url),
           profile_completed_at = CASE WHEN ? <> '' AND ? <> '' AND ? <> '' THEN COALESCE(profile_completed_at, ?) ELSE profile_completed_at END,
           updated_at = ?
       WHERE id = ?`,
      fullName,
      email,
      phone,
      address || "",
      cin || "",
      cinImageUrl || "",
      phone,
      cin || "",
      cinImageUrl || "",
      now,
      now,
      String(existing.id)
    );
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, nom, email, telephone, address, cin, cin_image_url FROM dwira.utilisateurs WHERE id = ? LIMIT 1`,
      String(existing.id)
    );
    return rows?.[0] || { id: String(existing.id), nom: fullName, email, telephone: phone, address, cin, cin_image_url: cinImageUrl };
  }

  const newId = `u_chatbot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = sqlDateOnly(new Date());
  await prisma.$executeRawUnsafe(
    `INSERT INTO dwira.utilisateurs
      (id, nom, email, role, avatar, telephone, address, client_type, cin, cin_image_url, profile_completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'user', NULL, ?, ?, 'locataire', ?, ?, ?, ?, ?)`,
    newId,
    fullName,
    email,
    phone,
    address,
    cin,
    cinImageUrl,
    cin && cinImageUrl ? now : null,
    createdAt,
    now
  );
  return { id: newId, nom: fullName, email, telephone: phone, address, cin, cin_image_url: cinImageUrl };
}

export async function createReservationDemandFromChat(payload) {
  const response = await fetch(`${apiBase()}/reservation-demands`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
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
    headers: adminHeaders({ "content-type": "application/json" }),
  });
  if (!response.ok) return [];
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function submitReservationIdentityFromChat(demandId, profile) {
  const normalizedDemandId = String(demandId || "").trim();
  if (!normalizedDemandId) return null;
  const cin = String(profile?.identityNumber || "").trim();
  const cinImageUrl = String(profile?.identityImageUrl || "").trim();
  const fullName = String(profile?.fullName || "").trim();
  if (!cin || !cinImageUrl || !fullName) return null;

  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts.slice(0, -1).join(" ").trim() || parts[0] || "";
  const lastName = parts.slice(-1).join(" ").trim() || parts[0] || "";

  const body = new FormData();
  body.set("document_type", "cin_tn");
  body.set("document_country", "tunisie");
  body.set("manual_document_number", cin);
  body.set("manual_first_name", firstName);
  body.set("manual_last_name", lastName);
  body.set("identity_document_image_url", cinImageUrl);

  const response = await fetch(`${apiBase()}/reservation-demands/${encodeURIComponent(normalizedDemandId)}/submit-identity`, {
    method: "POST",
    headers: adminHeaders(),
    body,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(String(data?.error || `Submit identity failed (${response.status})`));
  }
  return data;
}

export async function fetchReservationDemandById(demandId) {
  const normalizedDemandId = String(demandId || "").trim();
  if (!normalizedDemandId) return null;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT
      d.*,
      b.titre AS bien_titre,
      b.reference AS bien_reference,
      c.url_pdf AS contract_url,
      c.owner_url_pdf AS owner_contract_url,
      DATE_FORMAT(d.start_date, '%Y-%m-%d') AS start_date_fmt,
      DATE_FORMAT(d.end_date, '%Y-%m-%d') AS end_date_fmt,
      DATE_FORMAT(d.identity_submitted_at, '%Y-%m-%d %H:%i:%s') AS identity_submitted_at_fmt,
      DATE_FORMAT(d.contract_generated_at, '%Y-%m-%d %H:%i:%s') AS contract_generated_at_fmt,
      DATE_FORMAT(d.payment_receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS payment_receipt_uploaded_at_fmt,
      DATE_FORMAT(d.reservation_payment_paid_at, '%Y-%m-%d %H:%i:%s') AS reservation_payment_paid_at_fmt,
      DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_fmt
     FROM dwira.reservation_demands d
     LEFT JOIN dwira.biens b ON b.id = d.bien_id
     LEFT JOIN dwira.contrats c ON c.id = d.contract_id
     WHERE d.id = ?
     LIMIT 1`,
    normalizedDemandId
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateReservationDemandStatusFromChat(demandId, payload = {}) {
  const normalizedDemandId = String(demandId || "").trim();
  if (!normalizedDemandId) throw new Error("Missing reservation demand id");
  const response = await fetch(`${apiBase()}/reservation-demands/${encodeURIComponent(normalizedDemandId)}`, {
    method: "PUT",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response, "Reservation demand update failed");
}

export async function advanceReservationDemandToOwnerAcceptedFromChat(demandId) {
  return updateReservationDemandStatusFromChat(demandId, {
    status: "reponse_positive_attente_confirmation_client",
    actor_type: "admin",
    actor_id: "chatbot-lab",
    history_note: "Validation positive simulee depuis le chatbot lab",
  });
}

export async function advanceReservationDemandToPaymentStageFromChat(demandId) {
  const normalizedDemandId = String(demandId || "").trim();
  if (!normalizedDemandId) throw new Error("Missing reservation demand id");
  let demand = await fetchReservationDemandById(normalizedDemandId);
  if (!demand) throw new Error("Reservation demand not found");
  const currentStatus = String(demand.status || "").trim();
  if (currentStatus === "en_attente_reponse_proprietaire") {
    demand = await advanceReservationDemandToOwnerAcceptedFromChat(normalizedDemandId);
  }
  demand = await updateReservationDemandStatusFromChat(normalizedDemandId, {
    status: "client_procede_vers_paiement_en_cours",
    actor_type: "client",
    actor_id: String(demand?.client_user_id || demand?.client_email || "chatbot-client").trim() || "chatbot-client",
    history_note: "Passage a l'etape paiement simule depuis le chatbot lab",
  });

  const profile = await fetchProjectUserById(demand?.client_user_id || "");
  if (profile?.cin && profile?.cin_image_url && profile?.nom) {
    try {
      await submitReservationIdentityFromChat(normalizedDemandId, {
        fullName: profile.nom,
        phone: profile.telephone || "",
        email: profile.email || "",
        address: profile.address || "",
        identityNumber: profile.cin,
        identityImageUrl: profile.cin_image_url,
      });
    } catch {
      // Keep flow usable even if identity regeneration fails here.
    }
  }
  return fetchReservationDemandById(normalizedDemandId);
}

export async function uploadReservationPaymentReceiptLinkFromChat(demandId, payload = {}) {
  const normalizedDemandId = String(demandId || "").trim();
  const receiptUrl = String(payload?.receiptUrl || payload?.imageUrl || "").trim();
  if (!normalizedDemandId) throw new Error("Missing reservation demand id");
  if (!receiptUrl) throw new Error("Missing receipt URL");
  const demand = await fetchReservationDemandById(normalizedDemandId);
  if (!demand) throw new Error("Reservation demand not found");
  const nextStatus = "recu_paiement_envoye";
  const note = String(payload?.note || "").trim() || null;
  const paymentReference = String(payload?.paymentReference || payload?.paymentId || "").trim() || null;
  const now = sqlDateTime();
  await prisma.$executeRawUnsafe(
    `UPDATE dwira.reservation_demands
     SET status = ?,
         payment_receipt_image_url = ?,
         payment_receipt_uploaded_at = ?,
         payment_receipt_note = ?,
         payment_id = COALESCE(?, payment_id),
         updated_at = ?
     WHERE id = ?`,
    nextStatus,
    receiptUrl,
    now,
    note,
    paymentReference,
    now,
    normalizedDemandId
  );
  return fetchReservationDemandById(normalizedDemandId);
}

export async function createReservationCheckoutFromChat(demandId, provider = "clicktopay", scope = "reservation") {
  const normalizedDemandId = String(demandId || "").trim();
  const normalizedProvider = String(provider || "clicktopay").trim().toLowerCase();
  const normalizedScope = String(scope || "reservation").trim().toLowerCase();
  if (!normalizedDemandId) throw new Error("Missing reservation demand id");
  if (!["clicktopay", "flouci"].includes(normalizedProvider)) throw new Error("Unsupported payment provider");
  const response = await fetch(`${apiBase()}/reservation-demands/${encodeURIComponent(normalizedDemandId)}/${normalizedProvider}/create-checkout`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ scope: normalizedScope }),
  });
  return parseJsonResponse(response, "Payment checkout creation failed");
}

export async function confirmManualReservationPaymentFromChat(demandId, scope = "reservation", method = "virement") {
  const normalizedDemandId = String(demandId || "").trim();
  if (!normalizedDemandId) throw new Error("Missing reservation demand id");
  const response = await fetch(`${apiBase()}/reservation-demands/${encodeURIComponent(normalizedDemandId)}/pay`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ scope, methode: method }),
  });
  return parseJsonResponse(response, "Manual payment confirmation failed");
}

export async function createReservationDemandDirectFromChat(payload, profile = {}) {
  const bienId = String(payload?.bien_id || "").trim();
  const clientUserId = String(payload?.client_user_id || "").trim();
  const clientName = String(payload?.client_name || "").trim();
  const clientEmail = normalizeEmail(payload?.client_email);
  const startDate = sqlDateOnly(payload?.start_date);
  const endDate = sqlDateOnly(payload?.end_date);
  const guests = Math.max(1, Number(payload?.guests || 1));
  const adultGuests = Math.max(1, Number(payload?.adult_guests || guests));
  const childGuests = Math.max(0, Number(payload?.child_guests || 0));
  const paymentMode = String(payload?.payment_mode || "avance").trim() || "avance";
  const totalAmount = Number(payload?.total_amount || 0);
  const amountDueNow = Number(payload?.amount_due_now || 0);
  const now = new Date();
  const nowSql = sqlDateTime(now);
  const createdAt = nowSql;
  const paymentDeadline = sqlDateTime(new Date(now.getTime() + 48 * 60 * 60 * 1000));

  if (!bienId || !clientUserId || !startDate || !endDate) {
    throw new Error("Missing required reservation fields for direct creation");
  }
  if (endDate < startDate) {
    throw new Error("Invalid reservation date range");
  }

  const bienRows = await prisma.$queryRawUnsafe(
    `SELECT id, titre, reference, proprietaire_id, location_saisonniere_config_json
     FROM dwira.biens
     WHERE id = ?
     LIMIT 1`,
    bienId
  );
  const bien = Array.isArray(bienRows) ? bienRows[0] : null;
  if (!bien) throw new Error("Bien introuvable");

  const overlapRows = await prisma.$queryRawUnsafe(
    `SELECT id FROM dwira.unavailable_dates
     WHERE bien_id = ?
       AND start_date < ?
       AND end_date > ?
       AND status IN ('blocked', 'booked')
     LIMIT 1`,
    bienId,
    endDate,
    startDate
  );
  if (Array.isArray(overlapRows) && overlapRows[0]) {
    throw new Error("Bien deja indisponible sur cette periode");
  }

  const saisonCfg = safeParseJson(bien.location_saisonniere_config_json, {});
  const instantReservationEnabled = Boolean(saisonCfg?.reservation_instantanee || saisonCfg?.reservationInstantanee);
  const demandId = `rd_chatbot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const unavailableDateId = instantReservationEnabled ? null : `ud_chatbot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const initialDemandStatus = instantReservationEnabled ? "client_procede_vers_paiement_en_cours" : "en_attente_reponse_proprietaire";

  await prisma.$executeRawUnsafe(
    `INSERT INTO dwira.reservation_demands (
      id, bien_id, request_type, unavailable_date_id, client_user_id, client_email, client_name, proprietaire_id, owner_user_id,
      start_date, end_date, guests, adult_guests, child_guests, payment_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    demandId,
    bienId,
    "reservation",
    unavailableDateId,
    clientUserId,
    clientEmail || null,
    clientName || null,
    String(bien.proprietaire_id || "").trim() || null,
    null,
    startDate,
    endDate,
    guests,
    adultGuests,
    childGuests,
    paymentMode,
    initialDemandStatus,
    createdAt,
    createdAt
  );

  await prisma.$executeRawUnsafe(
    `UPDATE dwira.reservation_demands
     SET total_amount = ?,
         amount_due_now = ?,
         selected_fixed_services_json = ?,
         selected_variable_services_json = ?,
         variable_services_quote_json = ?,
         variable_services_quote_status = ?,
         client_note = ?,
         finalization_due_at = ?,
         identity_document_type = ?,
         identity_document_number = ?,
         identity_first_name = ?,
         identity_last_name = ?,
         identity_document_country = ?,
         identity_document_image_url = ?,
         identity_submitted_at = ?,
         updated_at = ?
     WHERE id = ?`,
    totalAmount || null,
    amountDueNow || null,
    JSON.stringify(payload?.selected_fixed_services || []),
    JSON.stringify(payload?.selected_variable_services || []),
    JSON.stringify([]),
    "aucun",
    payload?.client_note || null,
    paymentDeadline,
    profile?.identityNumber ? "cin_tn" : null,
    profile?.identityNumber || null,
    String(profile?.fullName || "").trim().split(/\s+/).slice(0, -1).join(" ") || null,
    String(profile?.fullName || "").trim().split(/\s+/).slice(-1).join(" ") || null,
    profile?.identityNumber ? "tunisie" : null,
    String(profile?.identityImageUrl || "").trim() || null,
    profile?.identityNumber && profile?.identityImageUrl ? createdAt : null,
    createdAt,
    demandId
  );

  if (unavailableDateId) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO dwira.unavailable_dates (id, bien_id, start_date, end_date, status, reservation_demand_id, payment_deadline)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      unavailableDateId,
      bienId,
      startDate,
      endDate,
      demandId,
      paymentDeadline.slice(0, 10)
    );
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, bien_id, client_user_id, client_email, client_name, start_date, end_date, guests, status,
            identity_document_number, identity_document_image_url, created_at, updated_at
     FROM dwira.reservation_demands
     WHERE id = ?
     LIMIT 1`,
    demandId
  );
  return Array.isArray(rows) ? rows[0] : null;
}
