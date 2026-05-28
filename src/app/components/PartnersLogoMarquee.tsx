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
  const loopItems = [...partnerLogos, ...partnerLogos];

  return (
    <section aria-label="Partenaires">
      <div className="partners-marquee">
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
