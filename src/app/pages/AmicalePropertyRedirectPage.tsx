import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { fetchAmicalesPublic, findAmicaleBySlug, normalizeAmicaleSlug, type AmicaleItem } from "../utils/amicales";

export default function AmicalePropertyRedirectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { amicaleSlug = "", propertyRef = "" } = useParams();
  const normalizedSlug = useMemo(() => normalizeAmicaleSlug(amicaleSlug), [amicaleSlug]);
  const decodedPropertyRef = useMemo(() => decodeURIComponent(String(propertyRef || "").trim()), [propertyRef]);
  const [loading, setLoading] = useState(true);
  const [amicale, setAmicale] = useState<AmicaleItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const rows = await fetchAmicalesPublic();
        const match = findAmicaleBySlug(normalizedSlug, rows);
        if (cancelled) return;
        setAmicale(match);
        if (match && decodedPropertyRef) {
          const next = new URLSearchParams(searchParams);
          next.set("amicale", match.id);
          if (!next.get("mode")) {
            next.set("mode", "location_saisonniere");
          }
          navigate(`/properties/${encodeURIComponent(decodedPropertyRef)}?${next.toString()}`, { replace: true });
          return;
        }
      } catch {
        if (!cancelled) {
          setAmicale(null);
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
          {amicale ? "Reference bien introuvable" : "Amicale introuvable"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {amicale
            ? "Le lien est valide mais la reference du bien est introuvable."
            : "Le lien saisi ne correspond a aucune amicale active."}
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
