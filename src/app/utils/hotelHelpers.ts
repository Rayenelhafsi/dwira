import type { HotelDetail, HotelFacility, HotelSummary } from "../services/hotels";

export function formatHotelStarLabel(value?: string | number | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Hotel";
  return `${normalized} etoile${normalized === "1" ? "" : "s"}`;
}

export function extractHotelMinPrice(hotel?: HotelSummary | HotelDetail | null) {
  const prices: number[] = [];
  const priceNode = (hotel as any)?.Price;

  const pushPrice = (value: unknown) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      prices.push(numeric);
    }
  };

  const visitRoom = (room: any) => {
    if (!room || typeof room !== "object") return;
    pushPrice(room.PriceWithAffiliateMarkup);
    pushPrice(room.Price);
    const views = Array.isArray(room.View) ? room.View : [];
    views.forEach((view) => {
      pushPrice(view?.PriceWithAffiliateMarkup);
      pushPrice(view?.Price);
    });
    const supplements = Array.isArray(room.Supplement) ? room.Supplement : [];
    supplements.forEach((supplement) => {
      pushPrice(supplement?.PriceWithAffiliateMarkup);
      pushPrice(supplement?.Price);
    });
  };

  const visitBoarding = (boarding: any) => {
    if (!boarding || typeof boarding !== "object") return;
    pushPrice(boarding.PriceWithAffiliateMarkup);
    pushPrice(boarding.Price);
    const paxRows = Array.isArray(boarding.Pax) ? boarding.Pax : [];
    paxRows.forEach((paxRow) => {
      const rooms = Array.isArray(paxRow?.Rooms) ? paxRow.Rooms : [];
      rooms.forEach(visitRoom);
    });
    const directRooms = Array.isArray(boarding.Rooms) ? boarding.Rooms : [];
    directRooms.forEach(visitRoom);
  };

  if (priceNode && typeof priceNode === "object") {
    pushPrice(priceNode.PriceWithAffiliateMarkup);
    const boardings = Array.isArray(priceNode.Boarding) ? priceNode.Boarding : [];
    boardings.forEach(visitBoarding);
  }

  return prices.length > 0 ? Math.min(...prices) : null;
}

export function extractHotelBoardingNames(hotel?: HotelSummary | HotelDetail | null) {
  const boardings = Array.isArray((hotel as any)?.Price?.Boarding) ? (hotel as any).Price.Boarding : [];
  return Array.from(
    new Set(
      boardings
        .map((boarding: any) => String(boarding?.Name || "").trim())
        .filter(Boolean)
    )
  );
}

export function getHotelFacilityTitles(facilities?: HotelFacility[] | null, max = 8) {
  if (!Array.isArray(facilities)) return [];
  return Array.from(
    new Set(
      facilities
        .map((facility) => String(facility?.Title || "").trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

export function getHotelAlbum(detail?: HotelDetail | null) {
  const album = Array.isArray(detail?.Album) ? detail.Album : [];
  const urls = album
    .map((item) => String(item?.Url || "").trim())
    .filter(Boolean);
  const cover = String(detail?.Image || "").trim();
  return Array.from(new Set([cover, ...urls].filter(Boolean)));
}

function decodeHtmlEntities(value: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return value
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&rsquo;/gi, "'")
      .replace(/&lsquo;/gi, "'")
      .replace(/&rdquo;/gi, '"')
      .replace(/&ldquo;/gi, '"')
      .replace(/&eacute;/gi, "e")
      .replace(/&egrave;/gi, "e")
      .replace(/&ecirc;/gi, "e")
      .replace(/&agrave;/gi, "a")
      .replace(/&ocirc;/gi, "o");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export function renderHotelRichText(value?: string | null) {
  const source = String(value || "").trim();
  if (!source) return "";

  return decodeHtmlEntities(source)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getHotelCardDescription(hotel?: HotelSummary | HotelDetail | null) {
  const candidates = [
    (hotel as any)?.ShortDescription,
    (hotel as any)?.HotelDescription,
    (hotel as any)?.Note,
    hotel?.Adress,
  ];

  for (const candidate of candidates) {
    const text = renderHotelRichText(String(candidate || ""));
    if (text) return text;
  }

  return "Consultez le detail pour voir les photos, les installations et les conditions de reservation.";
}

export function splitHotelTextParagraphs(value?: string | null) {
  return renderHotelRichText(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getHotelTagTitles(detail?: HotelDetail | null, max = 12) {
  const tags = Array.isArray(detail?.Tag) ? detail.Tag : [];
  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag?.Title || "").trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

export function getHotelOptionTitles(detail?: HotelDetail | null, max = 8) {
  const options = Array.isArray(detail?.Option) ? detail.Option : [];
  return Array.from(
    new Set(
      options
        .map((option) => String(option?.Title || "").trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}
