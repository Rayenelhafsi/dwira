const API_URL = import.meta.env.VITE_API_URL || "/api";

export type HotelCity = {
  Id: number;
  Name: string;
  Region?: string | null;
};

export type HotelFacility = {
  Title: string;
  Category?: string | null;
  Theme?: string[] | null;
  Note?: string | null;
  Option?: Array<{ Id: number; Title: string }> | null;
};

export type HotelImage = {
  Url: string;
  Description?: string | null;
};

export type HotelSummary = {
  Token?: string | null;
  Id: number;
  Name: string;
  Category?: { Title?: string | null } | null;
  Star?: string | number | null;
  City?: { Id?: number | null; Name?: string | null; ShortDescription?: string | null } | null;
  ShortDescription?: string | null;
  Adress?: string | null;
  Localization?: { Longitude?: string | null; Latitude?: string | null } | null;
  Image?: string | null;
  Facilities?: HotelFacility[] | null;
  Available?: boolean | null;
  Price?: any;
};

export type HotelDetail = HotelSummary & {
  LongDescription?: string | null;
  Album?: HotelImage[] | null;
};

export type HotelProviderConfig = {
  configured: boolean;
  provider: string;
  endpoint?: string | null;
};

export type HotelSearchRequest = {
  cityId?: number | null;
  hotelIds?: number[];
  checkIn: string;
  checkOut: string;
  adults: number;
  childAges?: number[];
  onlyAvailable?: boolean;
  categoryIds?: number[];
  tagIds?: number[];
  keywords?: string;
  currency?: string;
};

function buildApiUrl(path: string) {
  const base = String(API_URL || "/api").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : String((payload as any)?.error || (payload as any)?.message || "").trim();
    throw new Error(message || `Erreur API (${response.status})`);
  }

  return payload as T;
}

export async function getHotelConfig(): Promise<HotelProviderConfig> {
  const response = await fetch(buildApiUrl("/hotels/config"));
  return readApiResponse<HotelProviderConfig>(response);
}

export async function listHotelCities(): Promise<HotelCity[]> {
  const response = await fetch(buildApiUrl("/hotels/cities"));
  const payload = await readApiResponse<{ cities?: HotelCity[] }>(response);
  return Array.isArray(payload?.cities) ? payload.cities : [];
}

export async function listHotels(cityId?: number | null): Promise<HotelSummary[]> {
  const url = new URL(buildApiUrl("/hotels/list"), window.location.origin);
  if (Number(cityId) > 0) {
    url.searchParams.set("cityId", String(cityId));
  }
  const response = await fetch(url.pathname + url.search);
  const payload = await readApiResponse<{ hotels?: HotelSummary[] }>(response);
  return Array.isArray(payload?.hotels) ? payload.hotels : [];
}

export async function searchHotels(request: HotelSearchRequest): Promise<HotelSummary[]> {
  const response = await fetch(buildApiUrl("/hotels/search"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readApiResponse<{ hotels?: HotelSummary[] }>(response);
  return Array.isArray(payload?.hotels) ? payload.hotels : [];
}

export async function getHotelDetail(hotelId: number | string): Promise<HotelDetail> {
  const response = await fetch(buildApiUrl(`/hotels/${encodeURIComponent(String(hotelId))}`));
  const payload = await readApiResponse<{ hotel?: HotelDetail | null }>(response);
  if (!payload?.hotel) {
    throw new Error("Hotel introuvable.");
  }
  return payload.hotel;
}
