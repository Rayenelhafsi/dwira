import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Home, Landmark, MapPin, Ruler, Search, SlidersHorizontal, Trees, X } from "lucide-react";

type Choice = { value: string; label: string; imageUrl?: string | null };
type Field = { value: string; onChange: (value: string) => void };
type SaleType = "all" | "appartement" | "villa_maison" | "studio" | "immeuble" | "terrain" | "lotissement" | "local_commercial";
type Props = {
  regions: Choice[];
  zones: Choice[];
  types: Choice[];
  region: Field;
  zone: Field;
  type: Field;
  payment: Field;
  budget: Field;
  surface: Field;
  bedrooms: Field;
  facade: Field;
  distanceBeach: Field;
  units: Field;
  constructible: Field;
  onReset: () => void;
  activeCount: number;
};

function useCloseOnOutside(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !toggle.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onClose]);
  return { panel, toggle };
}

function ChoiceDropdown({
  label,
  value,
  options,
  onChange,
  icon,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  icon: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { panel, toggle } = useCloseOnOutside(open, () => setOpen(false));
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className="landing-sale-dropdown">
      <button ref={toggle} type="button" className="landing-search-field" disabled={disabled} aria-expanded={open} onClick={() => setOpen((next) => !next)}>
        {icon}
        <span>
          <span className="landing-field-label">{label}</span>
          <span className="landing-field-value">{selected?.label || "Choisir"}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div ref={panel} className="landing-sale-dropdown-panel" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selectedOption = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={selectedOption ? "is-selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selectedOption ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationDropdown({
  region,
  zone,
  regions,
  zones,
}: {
  region: Field;
  zone: Field;
  regions: Choice[];
  zones: Choice[];
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"regions" | "zones">("regions");
  const { panel, toggle } = useCloseOnOutside(open, () => setOpen(false));
  const selectedRegion = regions.find((option) => option.value === region.value);
  const selectedZone = zones.find((option) => option.value === zone.value);
  const label = selectedZone?.value !== "all"
    ? selectedZone.label
    : selectedRegion?.value !== "all"
      ? selectedRegion.label
      : "Tous les emplacements";

  return (
    <div className="landing-sale-dropdown">
      <button ref={toggle} type="button" className="landing-search-field" aria-expanded={open} onClick={() => {
        setOpen((next) => !next);
        setView(region.value === "all" ? "regions" : "zones");
      }}>
        <MapPin size={24} aria-hidden="true" />
        <span>
          <span className="landing-field-label">Emplacement</span>
          <span className="landing-field-value">{label}</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div ref={panel} className="landing-sale-step-panel landing-location-panel" role="dialog" aria-label="Emplacement">
          <div className="landing-step-head">
            <div>
              <p>Tunisie</p>
              <h3>{view === "regions" ? "Region" : "Zone"}</h3>
              <span>{view === "regions" ? "Choisissez une region." : "Affinez avec une zone."}</span>
            </div>
            <span>{view === "regions" ? "1/2" : "2/2"}</span>
          </div>
          <div className="landing-step-actions">
            <button type="button" onClick={() => {
              if (view === "zones") setView("regions");
              else {
                region.onChange("all");
                zone.onChange("all");
                setOpen(false);
              }
            }}>{view === "zones" ? "Precedent" : "Tous les emplacements"}</button>
            <button type="button" onClick={() => {
              if (view === "regions" && region.value !== "all") setView("zones");
              else setOpen(false);
            }}>Suivant</button>
          </div>
          <div className="landing-step-card-grid">
          {view === "regions" ? regions.filter((option) => option.value !== "all").map((option) => {
            const selectedOption = option.value === region.value;
            return (
              <button key={option.value} type="button" role="option" aria-selected={selectedOption} className={selectedOption ? "is-selected" : ""} onClick={() => {
                region.onChange(option.value);
                zone.onChange("all");
                setView("zones");
              }}>
                {option.imageUrl ? <img src={option.imageUrl} alt="" /> : null}
                <span>{option.label}</span>
                <i>{selectedOption ? <Check size={18} /> : null}</i>
              </button>
            );
          }) : zones.filter((option) => option.value !== "all").map((option) => {
            const selectedOption = option.value === zone.value;
            return (
              <button key={option.value} type="button" role="option" aria-selected={selectedOption} className={selectedOption ? "is-selected" : ""} onClick={() => {
                zone.onChange(option.value);
                setOpen(false);
              }}>
                {option.imageUrl ? <img src={option.imageUrl} alt="" /> : null}
                <span>{option.label}</span>
                <i>{selectedOption ? <Check size={18} /> : null}</i>
              </button>
            );
          })}
          </div>
          {(view === "regions" ? regions.length <= 1 : zones.length <= 1) ? (
            <p className="landing-step-empty">Aucune option disponible pour ce niveau.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TypeStepDropdown({ value, options, onChange }: { value: string; options: Choice[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const { panel, toggle } = useCloseOnOutside(open, () => setOpen(false));
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className="landing-sale-dropdown">
      <button ref={toggle} type="button" className="landing-search-field" aria-expanded={open} onClick={() => setOpen((next) => !next)}>
        {value === "terrain" ? <Trees size={24} /> : <Home size={24} />}
        <span>
          <span className="landing-field-label">Type de bien</span>
          <span className="landing-field-value">{selected?.label || "Tous les types"}</span>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div ref={panel} className="landing-sale-step-panel landing-type-panel" role="dialog" aria-label="Type de bien">
          <div className="landing-step-head">
            <div>
              <p>Bien a vendre</p>
              <h3>Type de bien</h3>
              <span>Choisissez une categorie de bien.</span>
            </div>
            <span>1/1</span>
          </div>
          <div className="landing-step-actions">
            <button type="button" onClick={() => onChange("all")}>Tous les types</button>
            <button type="button" onClick={() => setOpen(false)}>Appliquer</button>
          </div>
          <div className="landing-step-card-grid">
            {options.filter((option) => option.value !== "all").map((option) => {
              const selectedOption = option.value === value;
              return (
                <button key={option.value} type="button" className={selectedOption ? "is-selected" : ""} onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}>
                  {option.imageUrl ? <img src={option.imageUrl} alt="" /> : null}
                  <span>{option.label}</span>
                  <i>{selectedOption ? <Check size={18} /> : null}</i>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LandingSaleFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const { panel, toggle } = useCloseOnOutside(open, () => setOpen(false));
  const selectedType = props.type.value as SaleType;
  const characteristicFields = useMemo(() => {
    if (selectedType === "terrain") {
      return [
        ["Surface minimum (m2)", props.surface, Ruler],
        ["Distance plage max (m)", props.distanceBeach, MapPin],
      ] as const;
    }
    if (selectedType === "local_commercial") {
      return [
        ["Surface minimum (m2)", props.surface, Ruler],
        ["Façade minimum (m)", props.facade, Landmark],
      ] as const;
    }
    if (selectedType === "immeuble" || selectedType === "lotissement") {
      return [
        [selectedType === "immeuble" ? "Appartements minimum" : "Nombre de lots min", props.units, Home],
        ["Surface minimum (m2)", props.surface, Ruler],
      ] as const;
    }
    return [
      ["Surface minimum (m2)", props.surface, Ruler],
      ["Chambres minimum", props.bedrooms, Home],
    ] as const;
  }, [props.bedrooms, props.distanceBeach, props.facade, props.surface, props.units, selectedType]);
  const characteristicCount = [
    props.payment.value !== "all",
    props.budget.value,
    ...characteristicFields.map(([, field]) => field.value),
    selectedType === "terrain" && props.constructible.value !== "all" ? props.constructible.value : "",
  ].filter(Boolean).length;

  return (
    <form className="landing-search-panel" aria-label="Recherche de biens à vendre" onSubmit={(event) => {
      event.preventDefault();
      setOpen(false);
      document.getElementById("landing-catalogue")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }}>
      <div className="landing-sale-fields">
        <LocationDropdown region={props.region} zone={props.zone} regions={props.regions} zones={props.zones} />
        <TypeStepDropdown value={props.type.value} options={props.types} onChange={(value) => {
          props.type.onChange(value);
          props.bedrooms.onChange("");
          props.facade.onChange("");
          props.distanceBeach.onChange("");
          props.units.onChange("");
          props.constructible.onChange("all");
        }} />
        <div className="landing-characteristics">
          <button ref={toggle} type="button" className="landing-search-field" aria-expanded={open} aria-controls="landing-sale-characteristics" onClick={() => setOpen((value) => !value)}>
            <SlidersHorizontal size={22} aria-hidden="true" />
            <span>
              <span className="landing-field-label">Caractéristiques</span>
              <span className="landing-field-value">{characteristicCount ? `${characteristicCount} critère${characteristicCount > 1 ? "s" : ""}` : "Tous les critères"}</span>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {open && <div ref={panel} id="landing-sale-characteristics" className="landing-characteristics-panel" role="group" aria-label="Caractéristiques du bien">
            <div className="landing-characteristics-heading"><strong>Caractéristiques du bien</strong><button type="button" aria-label="Fermer les caractéristiques" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <label>Paiement<select value={props.payment.value} onChange={(event) => props.payment.onChange(event.target.value)}><option value="all">Tous les paiements</option><option value="comptant">Comptant</option><option value="facilite">Facilité de paiement</option></select></label>
            <label>Budget maximum (DT)<input type="number" min="0" inputMode="numeric" placeholder="Sans limite" value={props.budget.value} onChange={(event) => props.budget.onChange(event.target.value)} /></label>
            {selectedType === "terrain" && (
              <label>Constructibilité<select value={props.constructible.value} onChange={(event) => props.constructible.onChange(event.target.value)}><option value="all">Tous les terrains</option><option value="yes">Constructible</option><option value="no">Non constructible</option></select></label>
            )}
            {characteristicFields.map(([label, field, Icon]) => <label key={label}>{label}<span className="landing-input-icon"><Icon size={16} /><input type="number" min="0" inputMode="numeric" placeholder="Sans limite" value={field.value} onChange={(event) => field.onChange(event.target.value)} /></span></label>)}
            <button type="button" className="landing-search-submit" onClick={() => { setOpen(false); toggle.current?.focus(); }}>Appliquer</button>
          </div>}
        </div>
      </div>
      <button type="submit" className="landing-search-submit"><Search size={20} aria-hidden="true" />Rechercher</button>
      {props.activeCount > 0 && <button type="button" className="landing-search-reset" onClick={props.onReset}>Réinitialiser les filtres ({props.activeCount})</button>}
    </form>
  );
}
