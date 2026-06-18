import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { normalizeAmicaleSlug } from "../utils/amicales";
import { resolvePublicPartnerBySlug, type PublicPartnerResolution } from "../utils/publicPartnerResolver";

export default function AmicalePropertyRedirectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { amicaleSlug = "", propertyRef = "" } = useParams();
  const normalizedSlug = useMemo(() => normalizeAmicaleSlug(amicaleSlug), [amicaleSlug]);
  const decodedPropertyRef = useMemo(() => decodeURIComponent(String(propertyRef || "").trim()), [propertyRef]);
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<PublicPartnerResolution>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const match = await resolvePublicPartnerBySlug(normalizedSlug);
        if (cancelled) return;
        setResolution(match);
        if (match && decodedPropertyRef) {
          const next = new URLSearchParams(searchParams);
          if (match.kind === "amicale") {
            next.set("amicale", match.item.id);
            next.delete("partner");
            next.delete("partnerMargin");
          } else {
            next.set("partner", match.item.id);
            next.set("partnerMargin", String(match.item.marginMultiplier));
            next.delete("amicale");
          }
          if (!next.get("mode")) {
            next.set("mode", "location_saisonniere");
          }
          navigate(`/properties/${encodeURIComponent(decodedPropertyRef)}?${next.toString()}`, { replace: true });
          return;
        }
      } catch {
        if (!cancelled) {
          setResolution(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [decodedPropertyRef, navigate, normalizedSlug, searchParams]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm text-gray-700 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-600" />
          Redirection vers le bien...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          {resolution ? "Reference bien introuvable" : "Partenaire introuvable"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {resolution
            ? "Le lien est valide mais la reference du bien est introuvable."
            : "Le lien saisi ne correspond a aucun partenaire actif."}
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Retour a l'accueil
        </Link>
      </div>
    </div>
  );
}
