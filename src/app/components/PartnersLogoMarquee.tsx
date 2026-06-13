import { useEffect, useRef } from "react";
import { SmartImage } from "./SmartImage";

const PARTNERS_CDN_BASE = String(import.meta.env.VITE_PARTNERS_CDN_BASE_URL || "").trim().replace(/\/+$/, "");

const partnerLogos = [
  { path: "amicale-cadres-ministere-education.png", alt: "Amicale cadres ministere education" },
  { path: "bh-bank.png", alt: "BH Bank" },
  { path: "cnss.png", alt: "CNSS" },
  { path: "clicktopay.png", alt: "ClickToPay" },
  { path: "etap.png", alt: "ETAP" },
  { path: "flouci.png", alt: "Flouci" },
  { path: "gct-amicale.png", alt: "GCT Amicale" },
  { path: "gct.png", alt: "GCT" },
  { path: "mastercard.png", alt: "Mastercard" },
  { path: "mtk.png", alt: "MTK" },
  { path: "oaca.png", alt: "OACA" },
  { path: "opella.png", alt: "Opella" },
  { path: "pharmacie-centrale.png", alt: "Amicale de la Pharmacie Centrale" },
  { path: "serept.png", alt: "Serept" },
  { path: "sitep.png", alt: "SITEP" },
  { path: "tita-travel.png", alt: "Tita Travel" },
  { path: "visa.png", alt: "Visa" },
];

function resolvePartnerLogoUrl(path: string) {
  if (PARTNERS_CDN_BASE) return `${PARTNERS_CDN_BASE}/${path}`;
  return `/partners/${path}`;
}

export function PartnersLogoMarquee() {
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const loopItems = [...partnerLogos, ...partnerLogos];

  useEffect(() => {
    const disableGlow = typeof window !== "undefined" && (window.innerWidth < 1024 || window.matchMedia("(pointer: coarse)").matches);
    if (disableGlow) return;

    let intervalId: number | null = null;
    let items: HTMLElement[] = [];

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const root = marqueeRef.current;
      if (!root) return;
      if (items.length === 0) {
        items = Array.from(root.querySelectorAll<HTMLElement>(".partners-marquee-item"));
      }

      const rootRect = root.getBoundingClientRect();
      const centerX = rootRect.left + rootRect.width / 2;
      const activeHalfBand = Math.min(340, rootRect.width * 0.24);

      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const itemCenterX = rect.left + rect.width / 2;
        const distance = Math.abs(itemCenterX - centerX);
        const linear = Math.max(0, 1 - distance / activeHalfBand);
        const target = linear * linear * (3 - 2 * linear);
        const current = Number(item.dataset.glowP || "0");
        const smoothed = current + (target - current) * 0.14;
        item.dataset.glowP = smoothed.toFixed(4);
        item.style.setProperty("--glow-p", smoothed.toFixed(4));
      }
    };

    tick();
    intervalId = window.setInterval(tick, 80);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section aria-label="Partenaires">
      <div ref={marqueeRef} className="partners-marquee">
        <div className="partners-marquee-track">
          {loopItems.map((logo, idx) => (
            <div key={`${logo.path}-${idx}`} className="partners-marquee-item">
              <SmartImage
                src={resolvePartnerLogoUrl(logo.path)}
                alt={logo.alt}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                targetWidth={220}
                quality={54}
                sizes="160px"
                onError={(event) => {
                  const img = event.currentTarget;
                  const fallback = `/partners/${logo.path}`;
                  if (!img.src.endsWith(fallback)) {
                    img.src = fallback;
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
