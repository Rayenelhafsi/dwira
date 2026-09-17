import { useEffect, useRef, useState } from "react";
import { ChevronDown, Home, MapPin, Search, SlidersHorizontal, X } from "lucide-react";

type Choice = { value: string; label: string };
type Field = { value: string; onChange: (value: string) => void };
type Props = {
  zones: Choice[];
  types: Choice[];
  zone: Field;
  type: Field;
  payment: Field;
  budget: Field;
  surface: Field;
  bedrooms: Field;
  facade: Field;
  onReset: () => void;
  activeCount: number;
};

/** Compact landing presentation; the sales page owns all filtering rules. */
export function LandingSaleFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const characteristicCount = [props.payment.value !== "all", props.budget.value, props.surface.value, props.bedrooms.value, props.facade.value].filter(Boolean).length;
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !toggle.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <form className="landing-search-panel" aria-label="Recherche de biens à vendre" onSubmit={(event) => {
      event.preventDefault();
      setOpen(false);
      document.getElementById("landing-catalogue")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }}>
      <div className="landing-sale-fields">
        <label className="landing-search-field">
          <MapPin size={22} aria-hidden="true" />
          <span><span className="landing-field-label">Emplacement</span>
            <select aria-label="Emplacement" value={props.zone.value} onChange={(event) => props.zone.onChange(event.target.value)}>
              {props.zones.map((option) => <option key={option.value} value={option.value}>{option.value === "all" ? "Tous les emplacements" : option.label}</option>)}
            </select>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className="landing-search-field">
          <Home size={22} aria-hidden="true" />
          <span><span className="landing-field-label">Type de bien</span>
            <select aria-label="Type de bien" value={props.type.value} onChange={(event) => props.type.onChange(event.target.value)}>
              {props.types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <div className="landing-characteristics">
          <button ref={toggle} type="button" className="landing-search-field" aria-expanded={open} aria-controls="landing-sale-characteristics" onClick={() => setOpen((value) => !value)}>
            <SlidersHorizontal size={22} aria-hidden="true" />
            <span><span className="landing-field-label">Caractéristiques</span><span className="landing-field-value">{characteristicCount ? `${characteristicCount} critère${characteristicCount > 1 ? "s" : ""} sélectionné${characteristicCount > 1 ? "s" : ""}` : "Tous les critères"}</span></span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {open && <div ref={panel} id="landing-sale-characteristics" className="landing-characteristics-panel" role="group" aria-label="Caractéristiques du bien">
            <div className="landing-characteristics-heading"><strong>Caractéristiques du bien</strong><button type="button" aria-label="Fermer les caractéristiques" onClick={() => { setOpen(false); toggle.current?.focus(); }}><X size={18} /></button></div>
            <label>Paiement<select value={props.payment.value} onChange={(event) => props.payment.onChange(event.target.value)}><option value="all">Tous les paiements</option><option value="comptant">Comptant</option><option value="facilite">Facilité de paiement</option></select></label>
            {([
              ["Budget maximum (DT)", props.budget], ["Surface minimum (m²)", props.surface],
              ["Chambres minimum", props.bedrooms], ["Façade minimum (m)", props.facade],
            ] as [string, Field][]).map(([label, field]) => <label key={label}>{label}<input type="number" min="0" inputMode="numeric" placeholder="Sans limite" value={field.value} onChange={(event) => field.onChange(event.target.value)} /></label>)}
            <button type="button" className="landing-search-submit" onClick={() => { setOpen(false); toggle.current?.focus(); }}>Appliquer</button>
          </div>}
        </div>
      </div>
      <button type="submit" className="landing-search-submit"><Search size={20} aria-hidden="true" />Rechercher</button>
      {props.activeCount > 0 && <button type="button" className="landing-search-reset" onClick={props.onReset}>Réinitialiser les filtres ({props.activeCount})</button>}
    </form>
  );
}
