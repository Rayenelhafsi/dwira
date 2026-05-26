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

export type HotelCancellationPolicy = {
  Fees?: string | number | null;
  Type?: string | null;
  Nature?: string | null;
  FromDate?: string | null;
  MinStay?: number | null;
  MaxStay?: number | null;
};

export type HotelRoomView = {
  Id?: number | string | null;
  Name?: string | null;
  Price?: string | number | null;
  PriceWithAffiliateMarkup?: string | number | null;
};

export type HotelRoomSupplement = {
  Id?: number | string | null;
  Name?: string | null;
  Price?: string | number | null;
  PriceWithAffiliateMarkup?: string | number | null;
  Required?: boolean | null;
};

export type HotelRoomOffer = {
  Id?: number | string | null;
  Name?: string | null;
  Photo?: string | null;
  Description?: string | null;
  Quantity?: number | string | null;
  Price?: string | number | null;
  BasePrice?: string | number | null;
  PriceWithAffiliateMarkup?: string | number | null;
  OnRequest?: boolean | null;
  StopReservation?: boolean | null;
  NotRefundable?: boolean | null;
  CancellationDeadline?: string | null;
  MinStay?: number | null;
  View?: HotelRoomView[] | null;
  Supplement?: HotelRoomSupplement[] | null;
  CancellationPolicy?: HotelCancellationPolicy[] | null;
};

export type HotelPaxOffer = {
  Adult?: number | null;
  Child?: number[] | null;
  Rooms?: HotelRoomOffer[] | null;
};

export type HotelBoardingOffer = {
  Id?: number | null;
  Code?: string | null;
  Name?: string | null;
  Description?: string | null;
  Price?: string | number | null;
  PriceWithAffiliateMarkup?: string | number | null;
  MinStay?: number | null;
  StopSales?: any;
  Pax?: HotelPaxOffer[] | null;
  Rooms?: HotelRoomOffer[] | null;
};

export type HotelPriceNode = {
  BasePrice?: string | number | null;
  Price?: string | number | null;
  PriceWithAffiliateMarkup?: string | number | null;
  Boarding?: HotelBoardingOffer[] | null;
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
  HotelDescription?: string | null;
  Adress?: string | null;
  Localization?: { Longitude?: string | null; Latitude?: string | null } | null;
  Image?: string | null;
  Facilities?: HotelFacility[] | null;
  Available?: boolean | null;
  Currency?: string | null;
  Source?: string | number | null;
  Recommended?: number | null;
  Promotion?: { Title?: string | null; Description?: string | null; Rate?: string | number | null } | null;
  Price?: HotelPriceNode | null;
};

export type HotelDetail = HotelSummary & {
  LongDescription?: string | null;
  Album?: HotelImage[] | null;
  Tag?: Array<{ Id?: number; Title?: string | null; Image?: string | null }> | null;
  Option?: Array<{ Id?: number; Title?: string | null }> | null;
  Boarding?: Array<{ Id?: number; Code?: string | null; Name?: string | null; Description?: string | null }> | null;
  Note?: string | null;
  Email?: string | null;
  Phone?: string | null;
  CheckIn?: string | null;
  CheckOut?: string | null;
  Type?: string | null;
};

export type HotelProviderConfig = {
  configured: boolean;
  provider: string;
  endpoint?: string | null;
};

export type HotelBoarding = {
  Id: number;
  Code?: string | null;
  Name?: string | null;
};

export type HotelTag = {
  Id: number;
  Title?: string | null;
};

export type HotelCurrency = {
  Code: string;
  Symbol?: string | null;
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

export type HotelTravellerAdult = {
  Civility: string;
  Name: string;
  Surname: string;
  Holder: boolean;
};

export type HotelTravellerChild = {
  Name: string;
  Surname: string;
  Age: number;
};

export type HotelBookingRoomRequest = {
  roomId: number | string;
  boardingId: number;
  viewIds?: Array<number | string>;
  supplementIds?: Array<number | string>;
  adults: HotelTravellerAdult[];
  children?: HotelTravellerChild[];
};

export type HotelPrebookRequest = {
  token: string;
  cityId: number;
  hotelId: number;
  checkIn: string;
  checkOut: string;
  currency?: string;
  optionIds?: number[];
  methodPayment?: number;
  rooms: HotelBookingRoomRequest[];
};

export type HotelBookingFilters = {
  bookingId?: number;
  hotelId?: number;
  fromDate?: string;
  toDate?: string;
  state?: "OnRequest" | "Validated" | "Cancelled" | string;
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

export async function listHotelBoardings(): Promise<HotelBoarding[]> {
  const response = await fetch(buildApiUrl("/hotels/boardings"));
  const payload = await readApiResponse<{ boardings?: HotelBoarding[] }>(response);
  return Array.isArray(payload?.boardings) ? payload.boardings : [];
}

export async function listHotelTags(): Promise<HotelTag[]> {
  const response = await fetch(buildApiUrl("/hotels/tags"));
  const payload = await readApiResponse<{ tags?: HotelTag[] }>(response);
  return Array.isArray(payload?.tags) ? payload.tags : [];
}

export async function listHotelCurrencies(): Promise<HotelCurrency[]> {
  const response = await fetch(buildApiUrl("/hotels/currencies"));
  const payload = await readApiResponse<{ currencies?: HotelCurrency[] }>(response);
  return Array.isArray(payload?.currencies) ? payload.currencies : [];
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

export async function prebookHotel(request: HotelPrebookRequest) {
  const response = await fetch(buildApiUrl("/hotels/prebook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readApiResponse<any>(response);
}

export async function createHotelBooking(request: HotelPrebookRequest) {
  const response = await fetch(buildApiUrl("/hotels/book"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readApiResponse<any>(response);
}

export async function listHotelBookings(filters: HotelBookingFilters = {}) {
  const url = new URL(buildApiUrl("/hotels/bookings"), window.location.origin);
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  const response = await fetch(url.pathname + url.search);
  return readApiResponse<any>(response);
}

export async function cancelHotelBooking(request: { bookingId: number; preCancelled?: boolean; currency?: string }) {
  const response = await fetch(buildApiUrl("/hotels/bookings/cancel"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readApiResponse<any>(response);
}
