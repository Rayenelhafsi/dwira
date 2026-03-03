import { Link, useParams } from "react-router";
import { ArrowLeft, Map, Ruler, BadgeDollarSign } from "lucide-react";
import { useProperties } from "../context/PropertiesContext";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const slugify = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith("/") ? `${origin}${value}` : value;
};

export default function LotissementVenteDetailsPage() {
  const { slug } = useParams();
  const { biens, zones } = useProperties();
  const bien = biens.find((item) => item.mode === "vente" && item.type === "lotissement" && item.visible_sur_site !== false && slugify(item.titre) === slug);

  if (!bien) {
    return <div className="pt-28 text-center text-gray-700">Lotissement introuvable.</div>;
  }

  const zoneName = zones.find((z) => z.id === bien.zone_id)?.nom || "Zone non définie";
  const baseGallery = (bien.media || []).filter((img) => {
    const motif = String(img.motif_upload || "");
    return !motif.startsWith("preuve_type_") && !motif.startsWith("gallery_unite|");
  });
  const terrainImages = (index: number) =>
    (bien.media || []).filter((img) => String(img.motif_upload || "") === `gallery_unite|vente|lotissement|terrain_${index}`);

  return (
    <div className="bg-gray-50 min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl space-y-6">
        <Link to="/logements" className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800">
          <ArrowLeft size={16} />
          Retour aux biens
        </Link>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 md:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{bien.titre}</h1>
              <p className="text-gray-600 mt-1">{zoneName}</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">Vente lotissement</span>
          </div>
          {baseGallery[0] && (
            <img src={resolveMediaUrl(baseGallery[0].url)} alt={bien.titre} className="mt-5 w-full h-72 object-cover rounded-xl" />
          )}
          {bien.description && <p className="mt-4 text-gray-700 whitespace-pre-line">{bien.description}</p>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4"><Map className="text-emerald-700 mb-2" /><div className="text-sm text-gray-500">Terrains</div><div className="text-xl font-bold">{bien.lotissement_nb_terrains || 0}</div></div>
          <div className="bg-white rounded-xl border border-gray-200 p-4"><BadgeDollarSign className="text-emerald-700 mb-2" /><div className="text-sm text-gray-500">Prix total</div><div className="text-xl font-bold">{bien.lotissement_prix_total || 0} DT</div></div>
          <div className="bg-white rounded-xl border border-gray-200 p-4"><Ruler className="text-emerald-700 mb-2" /><div className="text-sm text-gray-500">Mode prix m2</div><div className="text-xl font-bold">{bien.lotissement_mode_prix_m2 || "-"}</div></div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 md:p-8 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Détail des terrains</h2>
          {(bien.lotissement_terrains || []).map((row, idx) => {
            const images = terrainImages(idx + 1);
            return (
              <div key={`terrain-${idx + 1}`} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-900">Terrain {idx + 1}</h3>
                  <span className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded">{row.reference || `TRN-${idx + 1}`}</span>
                </div>
                <div className="text-sm text-gray-700 mb-3">
                  Type: {row.type_terrain || "-"} | Surface: {row.surface_m2 || 0} m2 | Rue: {row.type_rue || "-"} | Papier: {row.type_papier || "-"}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {images.map((img) => <img key={img.id} src={resolveMediaUrl(img.url)} alt={`Terrain ${idx + 1}`} className="h-24 w-full rounded-lg object-cover" />)}
                  {images.length === 0 && <div className="text-xs text-gray-500">Aucune image affectée.</div>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
