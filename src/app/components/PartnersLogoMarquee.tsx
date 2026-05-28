import { useEffect, useRef } from "react";

const partnerLogos = [
  { src: "/partners/amicale-cadres-ministere-education.png", alt: "Amicale cadres ministere education" },
  { src: "/partners/bh-bank.png", alt: "BH Bank" },
  { src: "/partners/cnss.png", alt: "CNSS" },
  { src: "/partners/clicktopay.png", alt: "ClickToPay" },
  { src: "/partners/etap.png", alt: "ETAP" },
  { src: "/partners/flouci.png", alt: "Flouci" },
  { src: "/partners/gct-amicale.png", alt: "GCT Amicale" },
  { src: "/partners/gct.png", alt: "GCT" },
  { src: "/partners/mastercard.png", alt: "Mastercard" },
  { src: "/partners/mtk.png", alt: "MTK" },
  { src: "/partners/oaca.png", alt: "OACA" },
  { src: "/partners/opella.png", alt: "Opella" },
  { src: "/partners/serept.png", alt: "Serept" },
  { src: "/partners/tita-travel.png", alt: "Tita Travel" },
  { src: "/partners/visa.png", alt: "Visa" },
];

export function PartnersLogoMarquee() {
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const loopItems = [...partnerLogos, ...partnerLogos];

  useEffect(() => {
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
            <div key={`${logo.src}-${idx}`} className="partners-marquee-item">
              <img src={logo.src} alt={logo.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
