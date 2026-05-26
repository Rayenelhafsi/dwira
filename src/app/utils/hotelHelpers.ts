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
    pushPrice(room.Price);
    const supplements = Array.isArray(room.Supplement) ? room.Supplement : [];
    supplements.forEach((supplement) => pushPrice(supplement?.Price));
  };

  const visitBoarding = (boarding: any) => {
    if (!boarding || typeof boarding !== "object") return;
    pushPrice(boarding.Price);
    const rooms = Array.isArray(boarding.Rooms) ? boarding.Rooms : [];
    rooms.forEach(visitRoom);
  };

  if (priceNode && typeof priceNode === "object") {
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
