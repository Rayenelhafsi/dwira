import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { AlertCircle, ChevronLeft, ExternalLink, LoaderCircle, MapPin, ShieldCheck, Star } from "lucide-react";
import { SmartImage } from "../components/SmartImage";
import { getHotelDetail, type HotelDetail } from "../services/hotels";
import { extractHotelBoardingNames, extractHotelMinPrice, formatHotelStarLabel, getHotelAlbum, getHotelFacilityTitles } from "../utils/hotelHelpers";

const HOTEL_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23dbeafe'/%3E%3Cstop offset='100%25' stop-color='%23fde68a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3Cpath d='M0 530h1280v190H0z' fill='%230f766e' fill-opacity='0.18'/%3E%3Cpath d='M220 500V280l170-90 170 90v220H220zm410 0V230l120-70 120 70v270H630zm330 0V320l95-50 95 50v180H960z' fill='%23ffffff' fill-opacity='0.72'/%3E%3C/svg%3E";

function formatPrice(value: number | null) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value));
}

function buildMapsLink(detail?: HotelDetail | null) {
  const latitude = String(detail?.Localization?.Latitude || "").trim();
  const longitude = String(detail?.Localization?.Longitude || "").trim();
  if (!latitude || !longitude) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export default function HotelDetailsPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [hotel, setHotel] = useState<HotelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const hotelId = Number(params.id || 0);
    if (hotelId <= 0) {
      setError("Identifiant hotel invalide.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const detail = await getHotelDetail(hotelId);
        if (cancelled) return;
        setHotel(detail);
        setError("");
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Chargement du detail hotel impossible.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const gallery = useMemo(() => getHotelAlbum(hotel), [hotel]);
  const minPrice = useMemo(() => extractHotelMinPrice(hotel), [hotel]);
  const boardings = useMemo(() => extractHotelBoardingNames(hotel), [hotel]);
  const facilities = useMemo(() => getHotelFacilityTitles(hotel?.Facilities, 24), [hotel]);
  const mapsLink = useMemo(() => buildMapsLink(hotel), [hotel]);
  const backHref = searchParams.toString() ? `/hotels?${searchParams.toString()}` : "/hotels";

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 text-slate-500">
        <LoaderCircle size={22} className="animate-spin" />
        <span className="ml-3 text-sm">Chargement du detail hotel...</span>
      </div>
    );
  }

  if (error || !hotel) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-20 md:px-6">
        <div className="mx-auto max-w-3xl rounded-[30px] border border-amber-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
          <h1 className="mt-5 text-3xl font-semibold text-slate-900">Detail hotel indisponible</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{error || "Aucune donnee n'a ete retournee par le partenaire."}</p>
          <Link to={backHref} className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
            <ChevronLeft size={16} />
            Retour a la recherche
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_28%,#ffffff_100%)]">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.2),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(12,74,110,0.88))]" />
        <div className="relative container mx-auto px-4 py-14 md:px-6">
          <Link to={backHref} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/92 backdrop-blur transition hover:bg-white/16">
            <ChevronLeft size={16} />
            Retour a la recherche hotels
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
                {hotel.City?.Name || "Destination"}{hotel.Category?.Title ? ` · ${hotel.Category.Title}` : ""}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-6xl">{hotel.Name}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-sky-50/88">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                  <Star size={15} className="fill-current" />
                  {formatHotelStarLabel(hotel.Star)}
                </span>
                {hotel.Adress && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    <MapPin size={15} />
                    {hotel.Adress}
                  </span>
                )}
                {boardings.slice(0, 3).map((boarding) => (
                  <span key={`boarding-${boarding}`} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    <ShieldCheck size={15} />
                    {boarding}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/15 bg-white/10 p-6 backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">Tarif indicatif</p>
              <div className="mt-4 text-4xl font-semibold text-white">
                {minPrice !== null ? `${formatPrice(minPrice)} TND` : "Sur demande"}
              </div>
              <p className="mt-2 text-sm leading-6 text-sky-50/82">
                Le prix exact depend des dates, de la pension, des supplements et des chambres retournes par MyGo.
              </p>
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-sky-100"
                >
                  Ouvrir sur la carte
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[34px] border border-slate-100 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <SmartImage
                src={gallery[0] || HOTEL_FALLBACK_IMAGE}
                alt={hotel.Name}
                className="aspect-[16/9] w-full object-cover"
                targetWidth={1440}
                quality={72}
              />
            </div>

            {gallery.length > 1 && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {gallery.slice(1).map((url, index) => (
                  <div key={`${url}-${index}`} className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-sm">
                    <SmartImage
                      src={url}
                      alt={`${hotel.Name} ${index + 2}`}
                      className="aspect-[4/3] w-full object-cover"
                      targetWidth={720}
                      quality={66}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-semibold text-slate-900">Presentation</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {hotel.LongDescription || hotel.ShortDescription || "Le partenaire n'a pas fourni de description longue pour cet hotel."}
              </p>
            </div>

            {facilities.length > 0 && (
              <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <h2 className="text-2xl font-semibold text-slate-900">Equipements</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {facilities.map((item) => (
                    <span key={`${hotel.Id}-${item}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-semibold text-slate-900">Infos pratiques</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Ville:</span> {hotel.City?.Name || "-"}</p>
                <p><span className="font-semibold text-slate-900">Adresse:</span> {hotel.Adress || "-"}</p>
                <p><span className="font-semibold text-slate-900">Categorie:</span> {hotel.Category?.Title || "-"}</p>
                <p><span className="font-semibold text-slate-900">Classement:</span> {formatHotelStarLabel(hotel.Star)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
