import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  AlertCircle,
  BedDouble,
  CircleDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  ExternalLink,
  Facebook,
  Globe,
  KeyRound,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Star,
  Tags,
  TicketPercent,
  Upload,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { SmartImage } from "../components/SmartImage";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../context/AuthContext";
import { createHotelReservationDemand, getHotelDetail, searchHotels, type HotelDetail, type HotelSummary } from "../services/hotels";
import { completeSocialProfile, getAuthProviders, loginWithPasskey, registerWithPasskey, startSocialLogin } from "../services/auth";
import { buildApiUrl } from "../utils/api";
import { clearAuthPendingLogin, isAuthPendingLogin, saveAuthReturnTo, markAuthPendingLogin } from "../utils/pendingReservation";
import { fetchAmicalesPublic } from "../utils/amicales";
import {
  extractHotelBoardingNames,
  extractHotelMinPrice,
  flattenHotelRoomOffers,
  formatHotelCancellationPolicy,
  formatHotelStarLabel,
  getHotelAlbum,
  getHotelFacilityTitles,
  getHotelOptionTitles,
  getHotelTagTitles,
  pickHotelDisplayedPrice,
  renderHotelRichText,
  splitHotelTextParagraphs,
} from "../utils/hotelHelpers";

const HOTEL_FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23dbeafe'/%3E%3Cstop offset='100%25' stop-color='%23fde68a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3Cpath d='M0 530h1280v190H0z' fill='%230f766e' fill-opacity='0.18'/%3E%3Cpath d='M220 500V280l170-90 170 90v220H220zm410 0V230l120-70 120 70v270H630zm330 0V320l95-50 95 50v180H960z' fill='%23ffffff' fill-opacity='0.72'/%3E%3C/svg%3E";
const HOTEL_PENDING_DRAFT_KEY = "dwira_pending_hotel_reservation_draft";

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

function parseChildAgesParam(value: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
}

function splitHumanName(value?: string | null) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
}

function savePendingHotelDraft(payload: { hotelId: number; offerIndex: number; returnTo: string }) {
  try {
    sessionStorage.setItem(HOTEL_PENDING_DRAFT_KEY, JSON.stringify(payload));
  } catch {}
}

function readPendingHotelDraft() {
  try {
    const raw = sessionStorage.getItem(HOTEL_PENDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as { hotelId: number; offerIndex: number; returnTo: string };
  } catch {
    return null;
  }
}

function clearPendingHotelDraft() {
  try {
    sessionStorage.removeItem(HOTEL_PENDING_DRAFT_KEY);
  } catch {}
}

export default function HotelDetailsPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [hotel, setHotel] = useState<HotelDetail | null>(null);
  const [searchHotel, setSearchHotel] = useState<HotelSummary | null>(null);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestOfferIndex, setRequestOfferIndex] = useState<number | null>(null);
  const [reservationPhone, setReservationPhone] = useState("");
  const [reservationNote, setReservationNote] = useState("");
  const [amicaleOptions, setAmicaleOptions] = useState<Array<{ id: string; name: string; code: string; logoUrl?: string }>>([]);
  const [amicaleSelectionId, setAmicaleSelectionId] = useState("");
  const [amicaleFullName, setAmicaleFullName] = useState("");
  const [amicaleMatricule, setAmicaleMatricule] = useState("");
  const [amicalePhone, setAmicalePhone] = useState("");
  const [amicaleCode, setAmicaleCode] = useState("");
  const [reservationTravellers, setReservationTravellers] = useState<{
    adults: Array<{ firstName: string; lastName: string }>;
    children: Array<{ firstName: string; lastName: string }>;
  }>({
    adults: [],
    children: [],
  });
  const [reservationTravellerAccordionOpen, setReservationTravellerAccordionOpen] = useState("");
  const [submittingReservation, setSubmittingReservation] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [providers, setProviders] = useState({ google: false, facebook: false, apple: false, phoneOtp: false, emailOtp: false, passkey: true });
  const [isPasskeyPromptLoading, setIsPasskeyPromptLoading] = useState(false);
  const [isPasskeyCreateLoading, setIsPasskeyCreateLoading] = useState(false);
  const [loginPromptStep, setLoginPromptStep] = useState<"choices" | "passkey_setup" | "profile_setup">("choices");
  const [passkeyPromptEmail, setPasskeyPromptEmail] = useState("");
  const [passkeyPromptName, setPasskeyPromptName] = useState("");
  const [isProfilePromptSaving, setIsProfilePromptSaving] = useState(false);
  const [isProfileCinUploading, setIsProfileCinUploading] = useState(false);
  const [hasAutoOpenedReserve, setHasAutoOpenedReserve] = useState(false);
  const [profilePromptForm, setProfilePromptForm] = useState({
    firstName: "",
    lastName: "",
    clientType: "locataire",
    telephone: "",
    address: "",
    cin: "",
    cinImageUrl: "",
    cinImageRectoUrl: "",
    cinImageVersoUrl: "",
  });
  const [isAwaitingLogin, setIsAwaitingLogin] = useState(false);
  const checkIn = String(searchParams.get("checkIn") || "").trim();
  const checkOut = String(searchParams.get("checkOut") || "").trim();
  const childAges = parseChildAgesParam(searchParams.get("children"));
  const adults = Math.max(1, Number(searchParams.get("adults") || 2) || 2);
  const linkedAmicaleId = String(searchParams.get("amicale") || "").trim() || null;

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

  useEffect(() => {
    let cancelled = false;
    const hotelId = Number(params.id || 0);
    const checkIn = String(searchParams.get("checkIn") || "").trim();
    const checkOut = String(searchParams.get("checkOut") || "").trim();
    if (hotelId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
      setSearchHotel(null);
      setLoadingOffers(false);
      return;
    }

    const cityId = Number(searchParams.get("cityId") || 0) || undefined;
    const adults = Math.max(1, Number(searchParams.get("adults") || 2) || 2);
    const childAges = parseChildAgesParam(searchParams.get("children"));

    setLoadingOffers(true);
    void (async () => {
      try {
        const hotels = await searchHotels({
          cityId,
          hotelIds: [hotelId],
          checkIn,
          checkOut,
          adults,
          childAges,
          onlyAvailable: true,
        });
        if (cancelled) return;
        setSearchHotel(hotels.find((item) => Number(item?.Id) === hotelId) || null);
      } catch {
        if (!cancelled) {
          setSearchHotel(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingOffers(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, searchParams]);

  const returnToParam = String(searchParams.get("returnTo") || "").trim();
  const safeReturnTo = returnToParam.startsWith("/") ? returnToParam : "";
  const activeHotel = useMemo<HotelDetail | null>(() => {
    if (!hotel && !searchHotel) return null;
    return {
      ...(searchHotel || {}),
      ...(hotel || {}),
      Price: searchHotel?.Price ?? hotel?.Price,
      Promotion: searchHotel?.Promotion ?? hotel?.Promotion,
      Recommended: searchHotel?.Recommended ?? hotel?.Recommended,
      Facilities:
        Array.isArray(hotel?.Facilities) && hotel.Facilities.length > 0
          ? hotel.Facilities
          : searchHotel?.Facilities ?? null,
      City: hotel?.City || searchHotel?.City || null,
      Category: hotel?.Category || searchHotel?.Category || null,
      Star: hotel?.Star ?? searchHotel?.Star ?? null,
      Adress: hotel?.Adress || searchHotel?.Adress || null,
      Image: hotel?.Image || searchHotel?.Image || null,
      ShortDescription: hotel?.ShortDescription || searchHotel?.ShortDescription || null,
      HotelDescription: hotel?.HotelDescription || searchHotel?.HotelDescription || null,
    } as HotelDetail;
  }, [hotel, searchHotel]);
  const gallery = useMemo(() => getHotelAlbum(activeHotel), [activeHotel]);
  const minPrice = useMemo(() => extractHotelMinPrice(activeHotel), [activeHotel]);
  const boardings = useMemo(() => extractHotelBoardingNames(activeHotel), [activeHotel]);
  const facilities = useMemo(() => getHotelFacilityTitles(activeHotel?.Facilities, 24), [activeHotel]);
  const tags = useMemo(() => getHotelTagTitles(activeHotel, 16), [activeHotel]);
  const options = useMemo(() => getHotelOptionTitles(activeHotel, 8), [activeHotel]);
  const presentationParagraphs = useMemo(() => {
    const sources = [
      activeHotel?.LongDescription,
      activeHotel?.HotelDescription,
      activeHotel?.ShortDescription,
    ];
    const seen = new Set<string>();
    const paragraphs: string[] = [];
    sources.forEach((source) => {
      splitHotelTextParagraphs(source).forEach((paragraph) => {
        const key = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        paragraphs.push(paragraph);
      });
    });
    return paragraphs;
  }, [activeHotel]);
  const practicalNote = useMemo(() => renderHotelRichText(activeHotel?.Note || ""), [activeHotel]);
  const preferredBoardingId = Math.max(0, Number(searchParams.get("boardingId") || 0) || 0);
  const preferredRoomId = Math.max(0, Number(searchParams.get("roomId") || 0) || 0);
  const shouldAutoOpenReserve = String(searchParams.get("reserve") || "") === "1";
  const roomOffers = useMemo(() => {
    const offers = flattenHotelRoomOffers(searchHotel);
    if (preferredBoardingId <= 0 && preferredRoomId <= 0) return offers;
    return [...offers].sort((a, b) => {
      const aRoomScore = Number(Number(a.room?.Id || 0) === preferredRoomId);
      const bRoomScore = Number(Number(b.room?.Id || 0) === preferredRoomId);
      if (aRoomScore !== bRoomScore) return bRoomScore - aRoomScore;
      const aScore = Number(Number(a.boardingId || 0) === preferredBoardingId);
      const bScore = Number(Number(b.boardingId || 0) === preferredBoardingId);
      return bScore - aScore;
    });
  }, [searchHotel, preferredBoardingId, preferredRoomId]);
  const activeRequestOffer = requestOfferIndex !== null ? roomOffers[requestOfferIndex] || null : null;
  const mapsLink = useMemo(() => buildMapsLink(activeHotel), [activeHotel]);
  const backParams = new URLSearchParams(searchParams);
  backParams.delete("returnTo");
  backParams.set("mode", "hotellerie");
  const backHref = safeReturnTo || `/?${backParams.toString()}`;
  const canNavigateBack = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (window.history.length <= 1) return false;
    try {
      if (!document.referrer) return false;
      return new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  }, []);
  const handleBackToResults = () => {
    if (canNavigateBack) {
      navigate(-1);
      return;
    }
    navigate(backHref);
  };

  useEffect(() => {
    if (!linkedAmicaleId) return;
    let cancelled = false;
    void fetchAmicalesPublic()
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((item) => ({
          id: String(item.id || "").trim(),
          name: String(item.name || "").trim(),
          code: String(item.code || "").trim(),
          logoUrl: item.logoUrl ? String(item.logoUrl).trim() : undefined,
        }));
        setAmicaleOptions(mapped);
        setAmicaleSelectionId(linkedAmicaleId);
      })
      .catch(() => {
        if (!cancelled) {
          setAmicaleOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [linkedAmicaleId]);
  const infoCards = useMemo(
    () => [
      {
        key: "category",
        label: "Categorie",
        value: activeHotel?.Category?.Title || activeHotel?.Type || "-",
        icon: <Star size={16} className="text-amber-600" />,
        tone: "bg-amber-50 text-amber-700",
      },
      {
        key: "checkin",
        label: "Check-in / out",
        value: activeHotel?.CheckIn || activeHotel?.CheckOut ? `${activeHotel?.CheckIn || "-"} / ${activeHotel?.CheckOut || "-"}` : "-",
        icon: <Clock3 size={16} className="text-sky-600" />,
        tone: "bg-sky-50 text-sky-700",
      },
      {
        key: "phone",
        label: "Telephone",
        value: activeHotel?.Phone || "-",
        icon: <Phone size={16} className="text-emerald-600" />,
        tone: "bg-emerald-50 text-emerald-700",
      },
      {
        key: "email",
        label: "Email",
        value: activeHotel?.Email || "-",
        icon: <Mail size={16} className="text-violet-600" />,
        tone: "bg-violet-50 text-violet-700",
      },
    ],
    [activeHotel]
  );

  useEffect(() => {
    let cancelled = false;
    if (!showLoginPrompt) return;
    void getAuthProviders().then((availableProviders) => {
      if (!cancelled) setProviders(availableProviders);
    });
    return () => {
      cancelled = true;
    };
  }, [showLoginPrompt]);

  const openProfileSetupStep = (sourceUser?: any) => {
    const currentUser = sourceUser || user;
    const nameParts = splitHumanName(currentUser?.name || "");
    setProfilePromptForm({
      firstName: String(currentUser?.firstName || nameParts.firstName || "").trim(),
      lastName: String(currentUser?.lastName || nameParts.lastName || "").trim(),
      clientType: "locataire",
      telephone: String(currentUser?.telephone || "").trim(),
      address: String(currentUser?.address || "").trim(),
      cin: String(currentUser?.cin || "").trim(),
      cinImageUrl: String(currentUser?.cinImageUrl || "").trim(),
      cinImageRectoUrl: String(currentUser?.cinImageRectoUrl || currentUser?.cinImageUrl || "").trim(),
      cinImageVersoUrl: String(currentUser?.cinImageVersoUrl || "").trim(),
    });
    setLoginPromptStep("profile_setup");
    setShowLoginPrompt(true);
  };

  const handleProfileCinUpload = async (event: React.ChangeEvent<HTMLInputElement>, side: "recto" | "verso") => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsProfileCinUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch(buildApiUrl("/upload"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || "Upload de la photo CIN echoue"));
      const imageUrl = String(data?.url || data?.imageUrl || "").trim();
      if (!imageUrl) throw new Error("URL photo CIN manquante");
      setProfilePromptForm((prev) => ({
        ...prev,
        cinImageUrl: side === "recto" ? imageUrl : prev.cinImageUrl,
        cinImageRectoUrl: side === "recto" ? imageUrl : prev.cinImageRectoUrl,
        cinImageVersoUrl: side === "verso" ? imageUrl : prev.cinImageVersoUrl,
      }));
      toast.success(`Photo CIN ${side === "recto" ? "recto" : "verso"} enregistree`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload de la photo CIN echoue");
    } finally {
      setIsProfileCinUploading(false);
      event.target.value = "";
    }
  };

  const openReservationRequest = (offerIndex: number) => {
    const isAmicaleFlow = Boolean(linkedAmicaleId);
    if (!user || user.role !== "user" || !user.email) {
      if (isAmicaleFlow) {
        setRequestOfferIndex(offerIndex);
        return;
      }
      savePendingHotelDraft({ hotelId: Number(params.id || 0), offerIndex, returnTo: `${location.pathname}${location.search}` });
      setRequestOfferIndex(offerIndex);
      setLoginPromptStep("choices");
      setShowLoginPrompt(true);
      return;
    }
    if (!isAmicaleFlow && !user.profileCompleted) {
      savePendingHotelDraft({ hotelId: Number(params.id || 0), offerIndex, returnTo: `${location.pathname}${location.search}` });
      setRequestOfferIndex(offerIndex);
      openProfileSetupStep(user);
      return;
    }
    if (isAmicaleFlow) {
      setAmicaleSelectionId(linkedAmicaleId || "");
      setAmicaleFullName(`${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim());
      setAmicalePhone(String(user.telephone || "").trim());
    }
    clearPendingHotelDraft();
    setRequestOfferIndex(offerIndex);
  };
  useEffect(() => {
    if (!shouldAutoOpenReserve || hasAutoOpenedReserve || roomOffers.length === 0 || requestOfferIndex !== null) return;
    const preferredIndex = roomOffers.findIndex((offer) => {
      if (preferredRoomId > 0 && Number(offer.room?.Id || 0) === preferredRoomId) return true;
      if (preferredBoardingId > 0 && Number(offer.boardingId || 0) === preferredBoardingId) return true;
      return false;
    });
    const targetIndex = preferredIndex >= 0 ? preferredIndex : 0;
    setHasAutoOpenedReserve(true);
    openReservationRequest(targetIndex);
  }, [shouldAutoOpenReserve, hasAutoOpenedReserve, roomOffers, requestOfferIndex, preferredBoardingId, preferredRoomId]);

  const submitHotelReservationDemand = async () => {
    const isAmicaleFlow = Boolean(linkedAmicaleId);
    if ((!user && !isAmicaleFlow) || !hotel || !activeRequestOffer) {
      return;
    }
    if (!checkIn || !checkOut) {
      toast.error("Veuillez lancer une recherche avec vos dates avant d'envoyer une demande.");
      return;
    }
    const effectivePhone = String(isAmicaleFlow ? amicalePhone : reservationPhone).trim();
    if (!effectivePhone) {
      toast.error("Numero de telephone obligatoire.");
      return;
    }
    const invalidAdultIndex = reservationTravellers.adults.findIndex(
      (adult) => !String(adult.firstName || "").trim() || !String(adult.lastName || "").trim()
    );
    if (invalidAdultIndex >= 0) {
      toast.error(`Identite incomplete pour Adulte ${invalidAdultIndex + 1}.`);
      setReservationTravellerAccordionOpen(`adult-${invalidAdultIndex}`);
      return;
    }
    const invalidChildIndex = reservationTravellers.children.findIndex(
      (child) => !String(child.firstName || "").trim() || !String(child.lastName || "").trim()
    );
    if (invalidChildIndex >= 0) {
      toast.error(`Identite incomplete pour Enfant ${invalidChildIndex + 1}.`);
      setReservationTravellerAccordionOpen(`child-${invalidChildIndex}`);
      return;
    }
    if (isAmicaleFlow) {
      const selectedAmicale = amicaleOptions.find((item) => item.id === amicaleSelectionId) || null;
      if (!selectedAmicale) {
        toast.error("Selection amicale invalide.");
        return;
      }
      if (!String(amicaleFullName || "").trim()) {
        toast.error("Nom et prenom obligatoires.");
        return;
      }
      if (!String(amicaleMatricule || "").trim()) {
        toast.error("Matricule obligatoire.");
        return;
      }
      if (selectedAmicale.code !== String(amicaleCode || "").trim()) {
        toast.error("Code amicale incorrect.");
        return;
      }
    }

    const displayedPrice = pickHotelDisplayedPrice(activeRequestOffer.room);
    setSubmittingReservation(true);
    try {
      const created = await createHotelReservationDemand({
        hotelId: hotel.Id,
        hotelName: hotel.Name,
        hotelCityId: hotel.City?.Id || null,
        hotelCityName: hotel.City?.Name || null,
        hotelImageUrl: gallery[0] || hotel.Image || null,
        checkIn,
        checkOut,
        adults,
        childAges,
        boardingId: activeRequestOffer.boardingId,
        boardingName: activeRequestOffer.boardingName,
        roomId: activeRequestOffer.room?.Id || null,
        roomName: activeRequestOffer.room?.Name || null,
        totalPrice: displayedPrice,
        currency: "TND",
        clientPhone: effectivePhone,
        clientNote: reservationNote.trim() || null,
        paymentMode: isAmicaleFlow ? "amicale" : "avance",
        pricingAmicaleId: isAmicaleFlow ? amicaleSelectionId : null,
        amicaleName: isAmicaleFlow ? String(amicaleFullName || "").trim() : null,
        amicaleMatricule: isAmicaleFlow ? String(amicaleMatricule || "").trim() : null,
        amicalePhone: isAmicaleFlow ? String(amicalePhone || "").trim() : null,
        amicaleCode: isAmicaleFlow ? String(amicaleCode || "").trim() : null,
        hotelContext: {
          token: searchHotel?.Token || null,
          publicPartnerSlug: null,
          amicaleId: linkedAmicaleId,
          hotel,
          offer: activeRequestOffer,
          travellers: {
            adults: reservationTravellers.adults.map((adult) => ({
              firstName: String(adult.firstName || "").trim(),
              lastName: String(adult.lastName || "").trim(),
            })),
            children: reservationTravellers.children.map((child, index) => ({
              firstName: String(child.firstName || "").trim(),
              lastName: String(child.lastName || "").trim(),
              age: Number(childAges[index] ?? 0),
            })),
          },
        },
      });
      if (isAmicaleFlow) {
        toast.success("Votre demande amicale hotellerie a ete envoyee.");
      } else {
        toast.success("Votre demande hotellerie a ete envoyee. Vous pouvez maintenant finaliser le paiement.");
      }
      setRequestOfferIndex(null);
      setReservationNote("");
      setReservationTravellerAccordionOpen("");
      clearPendingHotelDraft();
      if (!isAmicaleFlow) {
        navigate(`/mes-reservations/hotels/${encodeURIComponent(created.id)}/paiement`);
      }
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Impossible d'envoyer la demande hotellerie");
    } finally {
      setSubmittingReservation(false);
    }
  };

  const handlePromptSocialLogin = (provider: "google" | "facebook" | "apple") => {
    if (provider === "google" && !providers.google) {
      toast.error("Google login indisponible pour le moment");
      return;
    }
    if (provider === "facebook" && !providers.facebook) {
      toast.error("Facebook login indisponible pour le moment");
      return;
    }
    if (provider === "apple" && !providers.apple) {
      toast.error("Apple login indisponible pour le moment");
      return;
    }
    const returnTo = `${location.pathname}${location.search}`;
    saveAuthReturnTo(returnTo);
    markAuthPendingLogin();
    setIsAwaitingLogin(true);
    const popupUrl = buildApiUrl(`/auth/${provider}/start?return_to=${encodeURIComponent(returnTo)}`);
    const popup = window.open(
      popupUrl,
      "dwiraAuthPopup",
      "popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      startSocialLogin(provider, returnTo);
      return;
    }
    popup.focus();
  };

  const applyLoggedUser = (loggedUser: any) => {
    login({
      id: loggedUser.id,
      email: loggedUser.email,
      name: loggedUser.name,
      firstName: loggedUser.firstName || undefined,
      lastName: loggedUser.lastName || undefined,
      avatar: loggedUser.avatar || undefined,
      clientType: loggedUser.clientType || undefined,
      telephone: loggedUser.telephone || undefined,
      cin: loggedUser.cin || undefined,
      cinImageUrl: loggedUser.cinImageUrl || undefined,
      cinImageRectoUrl: loggedUser.cinImageRectoUrl || loggedUser.cinImageUrl || undefined,
      cinImageVersoUrl: loggedUser.cinImageVersoUrl || undefined,
      profileCompleted: loggedUser.profileCompleted,
      role: "user",
    });
  };

  const handlePromptPasskeyLogin = async () => {
    if (!providers.passkey) {
      toast.error("Passkey indisponible pour le moment");
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error("Passkey non supporte sur ce navigateur/appareil");
      return;
    }
    setIsPasskeyPromptLoading(true);
    try {
      const loggedUser = await loginWithPasskey();
      applyLoggedUser(loggedUser);
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info("Completez votre identite pour continuer.");
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Connexion Passkey reussie");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion Passkey echouee";
      const normalizedMessage = String(message).toLowerCase();
      const noPasskeyDetected = ["aucun passkey", "no passkey", "credential not found", "introuvable"].some((token) => normalizedMessage.includes(token));
      if (noPasskeyDetected) {
        setLoginPromptStep("passkey_setup");
        toast.info("Aucune passkey detectee. Creez-en une pour continuer.");
      } else {
        toast.error(message);
      }
    } finally {
      setIsPasskeyPromptLoading(false);
    }
  };

  const handlePromptPasskeyCreate = async () => {
    const email = passkeyPromptEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Entrez un email valide pour creer la passkey.");
      return;
    }
    setIsPasskeyCreateLoading(true);
    try {
      const loggedUser = await registerWithPasskey(email, passkeyPromptName.trim());
      applyLoggedUser(loggedUser);
      if (!loggedUser.profileCompleted) {
        openProfileSetupStep(loggedUser);
        toast.info("Completez votre identite pour continuer.");
        return;
      }
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Passkey creee et connexion reussie");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation Passkey echouee");
    } finally {
      setIsPasskeyCreateLoading(false);
    }
  };

  const handlePromptProfileComplete = async () => {
    if (!user?.id) {
      toast.error("Session utilisateur invalide. Reconnectez-vous.");
      return;
    }
    if (!profilePromptForm.firstName.trim() || !profilePromptForm.lastName.trim() || !profilePromptForm.telephone.trim() || !profilePromptForm.address.trim() || !profilePromptForm.cin.trim()) {
      toast.error("Nom, prenom, telephone, adresse et CIN sont obligatoires.");
      return;
    }
    if (!profilePromptForm.cinImageRectoUrl.trim() || !profilePromptForm.cinImageVersoUrl.trim()) {
      toast.error("Les photos CIN recto et verso sont obligatoires.");
      return;
    }
    setIsProfilePromptSaving(true);
    try {
      const savedUser = await completeSocialProfile({
        id: user.id,
        firstName: profilePromptForm.firstName.trim(),
        lastName: profilePromptForm.lastName.trim(),
        name: `${profilePromptForm.firstName.trim()} ${profilePromptForm.lastName.trim()}`.trim(),
        email: user.email,
        clientType: "locataire",
        telephone: profilePromptForm.telephone.trim(),
        address: profilePromptForm.address.trim(),
        cin: profilePromptForm.cin.trim(),
        cinImageUrl: profilePromptForm.cinImageRectoUrl.trim(),
        cinImageRectoUrl: profilePromptForm.cinImageRectoUrl.trim(),
        cinImageVersoUrl: profilePromptForm.cinImageVersoUrl.trim(),
      });
      applyLoggedUser(savedUser);
      setShowLoginPrompt(false);
      setLoginPromptStep("choices");
      toast.success("Profil complete. Vous pouvez continuer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de sauvegarder le profil");
    } finally {
      setIsProfilePromptSaving(false);
    }
  };

  useEffect(() => {
    setReservationPhone(String(user?.telephone || ""));
  }, [user?.telephone]);

  useEffect(() => {
    if (!linkedAmicaleId || !user) return;
    const fullName = `${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim();
    if (fullName) setAmicaleFullName((prev) => prev || fullName);
    if (String(user.telephone || "").trim()) setAmicalePhone((prev) => prev || String(user.telephone || "").trim());
  }, [linkedAmicaleId, user]);

  useEffect(() => {
    if (requestOfferIndex === null) return;
    const userName = splitHumanName(user?.name || "");
    const nextAdults = Array.from({ length: adults }).map((_, index) => ({
      firstName: index === 0 ? String(user?.firstName || userName.firstName || "").trim() : "",
      lastName: index === 0 ? String(user?.lastName || userName.lastName || "").trim() : "",
    }));
    const nextChildren = Array.from({ length: childAges.length }).map(() => ({ firstName: "", lastName: "" }));
    setReservationTravellers({ adults: nextAdults, children: nextChildren });
    setReservationTravellerAccordionOpen(nextAdults.length > 0 ? "adult-0" : nextChildren.length > 0 ? "child-0" : "");
  }, [requestOfferIndex, user?.firstName, user?.lastName, user?.name, adults, childAges.length]);

  useEffect(() => {
    if (!isAwaitingLogin && !isAuthPendingLogin()) return;
    if (!user || user.role !== "user" || !user.email) return;
    clearAuthPendingLogin();
    setIsAwaitingLogin(false);
    setShowLoginPrompt(false);
    if (!user.profileCompleted) {
      openProfileSetupStep(user);
    }
  }, [isAwaitingLogin, user]);

  useEffect(() => {
    if (!user || user.role !== "user" || !user.email) return;
    if (user.profileCompleted) return;
    if (showLoginPrompt && loginPromptStep === "profile_setup") return;
    openProfileSetupStep(user);
  }, [loginPromptStep, openProfileSetupStep, showLoginPrompt, user]);

  useEffect(() => {
    if (linkedAmicaleId) return;
    if (!user || user.role !== "user" || !user.email || !user.profileCompleted) return;
    const draft = readPendingHotelDraft();
    if (!draft) return;
    if (Number(draft.hotelId || 0) !== Number(params.id || 0)) return;
    setRequestOfferIndex(Number(draft.offerIndex));
    clearPendingHotelDraft();
  }, [linkedAmicaleId, params.id, user]);

  useEffect(() => {
    const onAuthMessage = (event: MessageEvent) => {
      const payload = event?.data;
      if (!payload || typeof payload !== "object") return;
      const type = String((payload as any).type || "").trim();
      const returnTo = String((payload as any).returnTo || "").trim();
      if (type === "DWIRA_AUTH_SUCCESS" && returnTo) {
        clearAuthPendingLogin();
        setIsAwaitingLogin(false);
        setShowLoginPrompt(false);
        window.location.assign(returnTo);
      }
    };
    window.addEventListener("message", onAuthMessage);
    return () => window.removeEventListener("message", onAuthMessage);
  }, []);

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
          <p className="mt-3 text-sm leading-6 text-slate-500">{error || "Aucune donnee detaillee n'est disponible pour cet hotel pour le moment."}</p>
          <button type="button" onClick={handleBackToResults} className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700">
            <ChevronLeft size={16} />
            Retour a la recherche
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_28%,#ffffff_100%)]">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.2),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(12,74,110,0.88))]" />
        <div className="relative container mx-auto px-4 py-14 md:px-6">
          <button type="button" onClick={handleBackToResults} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/92 backdrop-blur transition hover:bg-white/16">
            <ChevronLeft size={16} />
            Retour a la recherche hotels
          </button>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
                {activeHotel?.City?.Name || "Destination"}
                {activeHotel?.Category?.Title ? ` - ${activeHotel.Category.Title}` : ""}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-6xl">{activeHotel?.Name || hotel.Name}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-sky-50/88">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                  <Star size={15} className="fill-current" />
                  {formatHotelStarLabel(activeHotel?.Star)}
                </span>
                {activeHotel?.Adress && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    <MapPin size={15} />
                    {activeHotel.Adress}
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
                Le prix exact depend des dates, de la pension, des supplements et des chambres disponibles pour votre sejour.
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
              <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                {(presentationParagraphs.length > 0 ? presentationParagraphs : ["La description detaillee de cet hotel sera ajoutee prochainement."]).map((paragraph, index) => (
                  <p key={`presentation-${index}`}>{paragraph}</p>
                ))}
              </div>
            </div>

            {(tags.length > 0 || boardings.length > 0 || options.length > 0 || facilities.length > 0) && (
              <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                    <Sparkles size={20} />
                  </span>
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Caracteristiques</h2>
                    <p className="text-sm text-slate-500">Services, ambiances et options proposes par l'etablissement.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {tags.map((item) => (
                    <div key={`${hotel.Id}-tag-${item}`} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                        <Tags size={18} />
                      </span>
                      <span className="text-sm font-medium text-slate-800">{item}</span>
                    </div>
                  ))}
                  {facilities.map((item) => (
                    <div key={`${hotel.Id}-facility-${item}`} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={18} />
                      </span>
                      <span className="text-sm font-medium text-slate-800">{item}</span>
                    </div>
                  ))}
                  {boardings.map((item) => (
                    <div key={`${hotel.Id}-boarding-${item}`} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                        <UtensilsCrossed size={18} />
                      </span>
                      <span className="text-sm font-medium text-slate-800">{item}</span>
                    </div>
                  ))}
                  {options.map((item) => (
                    <div key={`${hotel.Id}-option-${item}`} className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                        <BedDouble size={18} />
                      </span>
                      <span className="text-sm font-medium text-slate-800">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Offres pour ce sejour</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchHotel
                      ? "Chambres, pensions et conditions retournees pour les dates de votre recherche."
                      : "Lancez une recherche avec vos dates pour afficher les chambres et tarifs exacts."}
                  </p>
                </div>
                {loadingOffers ? <LoaderCircle size={18} className="animate-spin text-slate-400" /> : null}
              </div>

              {!loadingOffers && roomOffers.length === 0 && (
                <div className="mt-5 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-sm text-slate-500">
                  Les tarifs detailles s'affichent apres une recherche avec ville, arrivee et depart.
                </div>
              )}

              {roomOffers.length > 0 && (
                <div className="mt-5 space-y-4">
                  {roomOffers.map((offer, index) => {
                    const room = offer.room;
                    const displayedPrice = pickHotelDisplayedPrice(room);
                    const cancellationLines = formatHotelCancellationPolicy(room?.CancellationPolicy);
                    const supplements = Array.isArray(room?.Supplement) ? room.Supplement : [];
                    const views = Array.isArray(room?.View) ? room.View : [];
                    return (
                      <div key={`${offer.boardingId}-${room?.Id}-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                              {offer.boardingName || "Pension"}
                            </p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">{room?.Name || "Chambre"}</h3>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {room?.NotRefundable ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                                  <ShieldX size={13} />
                                  Non remboursable
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  <ShieldCheck size={13} />
                                  Conditions d'annulation disponibles
                                </span>
                              )}
                              {room?.OnRequest || room?.StopReservation ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  Sur demande
                                </span>
                              ) : null}
                              {Number(room?.Quantity) > 0 ? (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                  {Number(room?.Quantity)} dispo
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="min-w-[160px] rounded-[20px] bg-white px-4 py-3 text-right shadow-sm">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              <CircleDollarSign size={14} />
                              Prix client
                            </span>
                            <div className="mt-2 text-2xl font-semibold text-slate-900">
                              {displayedPrice !== null ? `${formatPrice(displayedPrice)} TND` : "Sur demande"}
                            </div>
                            {room?.BasePrice && Number(room?.BasePrice) > 0 && Number(room?.BasePrice) !== displayedPrice ? (
                              <p className="mt-1 text-xs text-slate-500">Base: {formatPrice(Number(room?.BasePrice))} TND</p>
                            ) : null}
                          </div>
                        </div>

                        {views.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vues disponibles</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {views.map((view, viewIndex) => (
                                <span key={`${room?.Id}-view-${view?.Id || viewIndex}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                                  {String(view?.Name || "").trim() || "Vue"}
                                  {pickHotelDisplayedPrice(view) !== null ? ` · ${formatPrice(pickHotelDisplayedPrice(view))} TND` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {supplements.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Supplements</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {supplements.map((supplement, supplementIndex) => (
                                <span key={`${room?.Id}-supp-${supplement?.Id || supplementIndex}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                                  {String(supplement?.Name || "").trim() || "Supplement"}
                                  {pickHotelDisplayedPrice(supplement) !== null ? ` · ${formatPrice(pickHotelDisplayedPrice(supplement))} TND` : ""}
                                  {supplement?.Required ? " · obligatoire" : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {cancellationLines.length > 0 && (
                          <div className="mt-4 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              <TicketPercent size={14} />
                              Annulation
                            </p>
                            <div className="mt-2 space-y-2 text-sm text-slate-600">
                              {cancellationLines.map((line, lineIndex) => (
                                <p key={`${room?.Id}-cancel-${lineIndex}`}>{line}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                          <p className="text-sm text-slate-500">
                            Envoyez une demande pour cette offre et l'agence vous recontacte pour finaliser la reservation.
                          </p>
                          <button
                            type="button"
                            onClick={() => openReservationRequest(index)}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                          >
                            Demander cette reservation
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-semibold text-slate-900">Infos pratiques</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 sm:col-span-2">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    <MapPin size={14} />
                    Adresse
                  </span>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{activeHotel?.Adress || activeHotel?.City?.Name || "-"}</p>
                </div>
                {infoCards.map((item) => (
                  <div key={item.key} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${item.tone}`}>
                      {item.icon}
                    </span>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-800 break-words">{item.value}</p>
                  </div>
                ))}
              </div>
              {practicalNote && (
                <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                    <AlertCircle size={14} />
                    A noter
                  </span>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                    {practicalNote.split(/\n+/).map((line, index) => (
                      <p key={`note-${index}`}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                >
                  Voir l'emplacement sur la carte
                  <ExternalLink size={15} />
                </a>
              )}
            </div>

          </div>
        </div>
      </section>

      <Dialog open={requestOfferIndex !== null && (Boolean(linkedAmicaleId) || (!!user?.email && !!user?.profileCompleted))} onOpenChange={(open) => !open && !submittingReservation && setRequestOfferIndex(null)}>
        <DialogContent className="max-h-[86vh] w-[min(94vw,760px)] overflow-hidden rounded-[28px] border-0 p-0 shadow-2xl sm:w-[min(90vw,720px)]">
          <DialogHeader className="border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-2xl font-semibold text-slate-900">Demande de reservation hotellerie</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Verifiez l'offre choisie puis laissez votre numero pour que l'agence confirme la suite avec vous.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(86vh-92px)] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-5">
            <div className="space-y-5">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">{hotel.Name}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{activeRequestOffer?.boardingName || "Pension"} - {activeRequestOffer?.room?.Name || "Chambre"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="rounded-full bg-white px-3 py-1">{checkIn} au {checkOut}</span>
                <span className="rounded-full bg-white px-3 py-1">{adults} adulte(s){childAges.length > 0 ? `, ${childAges.length} enfant(s)` : ""}</span>
                <span className="rounded-full bg-white px-3 py-1">
                  {activeRequestOffer ? (pickHotelDisplayedPrice(activeRequestOffer.room) !== null ? `${formatPrice(pickHotelDisplayedPrice(activeRequestOffer.room))} TND` : "Sur demande") : "Sur demande"}
                </span>
              </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Identite voyageurs (obligatoire)</p>
              <div className="mt-3 space-y-3">
                {reservationTravellers.adults.map((adult, index) => (
                  <div key={`detail-adult-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <button
                      type="button"
                      onClick={() => setReservationTravellerAccordionOpen((prev) => (prev === `adult-${index}` ? "" : `adult-${index}`))}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
                    >
                      <p className="text-xs font-semibold text-slate-700">Adulte {index + 1}</p>
                      <ChevronDown size={16} className={`text-slate-500 transition-transform ${reservationTravellerAccordionOpen === `adult-${index}` ? "rotate-180" : ""}`} />
                    </button>
                    {reservationTravellerAccordionOpen === `adult-${index}` ? (
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={adult.firstName}
                          onChange={(event) =>
                            setReservationTravellers((prev) => {
                              const nextAdults = [...prev.adults];
                              nextAdults[index] = { ...nextAdults[index], firstName: event.target.value };
                              return { ...prev, adults: nextAdults };
                            })
                          }
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                          placeholder="Prenom *"
                        />
                        <input
                          type="text"
                          value={adult.lastName}
                          onChange={(event) =>
                            setReservationTravellers((prev) => {
                              const nextAdults = [...prev.adults];
                              nextAdults[index] = { ...nextAdults[index], lastName: event.target.value };
                              return { ...prev, adults: nextAdults };
                            })
                          }
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                          placeholder="Nom *"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                {reservationTravellers.children.map((child, index) => (
                  <div key={`detail-child-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <button
                      type="button"
                      onClick={() => setReservationTravellerAccordionOpen((prev) => (prev === `child-${index}` ? "" : `child-${index}`))}
                      className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left"
                    >
                      <p className="text-xs font-semibold text-slate-700">Enfant {index + 1} ({Number(childAges[index] ?? 0)} ans)</p>
                      <ChevronDown size={16} className={`text-slate-500 transition-transform ${reservationTravellerAccordionOpen === `child-${index}` ? "rotate-180" : ""}`} />
                    </button>
                    {reservationTravellerAccordionOpen === `child-${index}` ? (
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={child.firstName}
                          onChange={(event) =>
                            setReservationTravellers((prev) => {
                              const nextChildren = [...prev.children];
                              nextChildren[index] = { ...nextChildren[index], firstName: event.target.value };
                              return { ...prev, children: nextChildren };
                            })
                          }
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                          placeholder="Prenom *"
                        />
                        <input
                          type="text"
                          value={child.lastName}
                          onChange={(event) =>
                            setReservationTravellers((prev) => {
                              const nextChildren = [...prev.children];
                              nextChildren[index] = { ...nextChildren[index], lastName: event.target.value };
                              return { ...prev, children: nextChildren };
                            })
                          }
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                          placeholder="Nom *"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              </div>

              <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Telephone *</label>
              <input
                value={linkedAmicaleId ? amicalePhone : reservationPhone}
                onChange={(event) => (linkedAmicaleId ? setAmicalePhone(event.target.value) : setReservationPhone(event.target.value))}
                placeholder="+216 ..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              />
              </div>

              {linkedAmicaleId && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Formulaire amicale</p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-emerald-800">Selectionner amicale</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {amicaleOptions.map((item) => (
                          <button
                            key={`hotel-detail-amicale-${item.id}`}
                            type="button"
                            onClick={() => {
                              setAmicaleSelectionId(item.id);
                            }}
                            className={`relative h-16 overflow-hidden rounded-lg border text-left transition ${
                              amicaleSelectionId === item.id
                                ? "border-emerald-600 ring-2 ring-emerald-300"
                                : "border-emerald-200 hover:border-emerald-400"
                            }`}
                          >
                            {item.logoUrl ? (
                              <div
                                className="absolute inset-0 bg-no-repeat"
                                style={{ backgroundImage: `url(${item.logoUrl})`, backgroundSize: "100% 100%" }}
                              />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-r from-emerald-100 to-white" />
                            )}
                            <div className="absolute inset-0 bg-black/25" />
                            <div className="relative z-10 px-3 py-2 text-sm font-semibold text-white">{item.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={amicaleFullName}
                      onChange={(event) => setAmicaleFullName(event.target.value)}
                      placeholder="Nom et prenom"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900"
                    />
                    <input
                      type="text"
                      value={amicaleMatricule}
                      onChange={(event) => setAmicaleMatricule(event.target.value)}
                      placeholder="Identifiant interne (Matricule)"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900"
                    />
                    <input
                      type="text"
                      value={amicaleCode}
                      onChange={(event) => setAmicaleCode(event.target.value)}
                      placeholder="Code"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900"
                    />
                  </div>
                </div>
              )}

              <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Message complementaire</label>
              <textarea
                value={reservationNote}
                onChange={(event) => setReservationNote(event.target.value)}
                rows={4}
                placeholder="Exemple: heure d'arrivee souhaitee, demande particuliere, mode de contact prefere..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              />
              </div>

              <DialogFooter className="sticky bottom-0 z-10 -mx-4 border-t border-slate-100 bg-white/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:-mx-6 sm:px-6">
                <button
                  type="button"
                  onClick={() => setRequestOfferIndex(null)}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  disabled={submittingReservation}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void submitHotelReservationDemand()}
                  disabled={submittingReservation}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submittingReservation ? <LoaderCircle size={16} className="animate-spin" /> : null}
                  {linkedAmicaleId ? "Envoyer la demande amicale" : "Envoyer la demande"}
                </button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoginPrompt} onOpenChange={(open) => { if (!open && loginPromptStep !== "profile_setup") setShowLoginPrompt(false); }}>
        <DialogContent className="max-w-md rounded-[28px] border border-white/60 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">Connectez-vous pour continuer</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-gray-500">
              Utilisez Google, Facebook, Apple ou Passkey pour envoyer votre demande hotel et proceder directement au paiement.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {loginPromptStep === "choices" && (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={!providers.google}
                  onClick={() => handlePromptSocialLogin("google")}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Globe className="h-5 w-5 text-emerald-700" />
                  Continuer avec Google
                </button>
                <button
                  type="button"
                  disabled={!providers.facebook}
                  onClick={() => handlePromptSocialLogin("facebook")}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Facebook className="h-5 w-5 text-blue-600" />
                  Continuer avec Facebook
                </button>
                <button
                  type="button"
                  disabled={!providers.apple}
                  onClick={() => handlePromptSocialLogin("apple")}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continuer avec Apple / iCloud
                </button>
                <button
                  type="button"
                  disabled={isPasskeyPromptLoading || !providers.passkey}
                  onClick={() => void handlePromptPasskeyLogin()}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound className="h-5 w-5 text-emerald-700" />
                  {isPasskeyPromptLoading ? "Verification Passkey..." : "Continuer avec Passkey"}
                </button>
              </div>
            )}

            {loginPromptStep === "passkey_setup" && (
              <div className="space-y-3">
                <button type="button" onClick={() => setLoginPromptStep("choices")} className="text-xs font-semibold text-emerald-700">
                  Retour
                </button>
                <input
                  type="email"
                  value={passkeyPromptEmail}
                  onChange={(event) => setPasskeyPromptEmail(event.target.value)}
                  placeholder="Email client"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <input
                  type="text"
                  value={passkeyPromptName}
                  onChange={(event) => setPasskeyPromptName(event.target.value)}
                  placeholder="Nom (optionnel)"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <button
                  type="button"
                  disabled={isPasskeyCreateLoading}
                  onClick={() => void handlePromptPasskeyCreate()}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <KeyRound className="h-5 w-5 text-white" />
                  {isPasskeyCreateLoading ? "Creation Passkey..." : "Creer et continuer"}
                </button>
              </div>
            )}

            {loginPromptStep === "profile_setup" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Completez votre identite. Le popup reste bloque tant que la CIN et sa photo ne sont pas enregistrees.</p>
                <input
                  type="text"
                  value={profilePromptForm.firstName}
                  onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="Prenom *"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <input
                  type="text"
                  value={profilePromptForm.lastName}
                  onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Nom *"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <input
                  type="tel"
                  value={profilePromptForm.telephone}
                  onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, telephone: event.target.value }))}
                  placeholder="Telephone *"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <input
                  type="text"
                  value={profilePromptForm.address}
                  onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Adresse *"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <input
                  type="text"
                  value={profilePromptForm.cin}
                  onChange={(event) => setProfilePromptForm((prev) => ({ ...prev, cin: event.target.value }))}
                  placeholder="CIN *"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Recto</p>
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                      <Upload className="h-4 w-4" />
                      {isProfileCinUploading ? "Upload photo CIN..." : "Uploader recto *"}
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleProfileCinUpload(event, "recto")} />
                    </label>
                    {profilePromptForm.cinImageRectoUrl ? (
                      <img src={profilePromptForm.cinImageRectoUrl} alt="Photo CIN recto" className="mt-2 h-32 w-full rounded-xl border border-emerald-200 object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Verso</p>
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                      <Upload className="h-4 w-4" />
                      {isProfileCinUploading ? "Upload photo CIN..." : "Uploader verso *"}
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleProfileCinUpload(event, "verso")} />
                    </label>
                    {profilePromptForm.cinImageVersoUrl ? (
                      <img src={profilePromptForm.cinImageVersoUrl} alt="Photo CIN verso" className="mt-2 h-32 w-full rounded-xl border border-emerald-200 object-cover" />
                    ) : null}
                  </div>
                </div>
                {(!profilePromptForm.cinImageRectoUrl || !profilePromptForm.cinImageVersoUrl) ? (
                  <p className="text-xs text-red-600 sm:col-span-2">Les photos CIN recto et verso sont obligatoires pour continuer.</p>
                ) : null}
                <button
                  type="button"
                  disabled={isProfilePromptSaving || isProfileCinUploading}
                  onClick={() => void handlePromptProfileComplete()}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isProfilePromptSaving ? "Enregistrement..." : "Continuer"}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
