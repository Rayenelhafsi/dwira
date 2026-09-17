import { useRef } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

const residences = [
  ["SkyScrapper Flats", "Manhattan", "imgMariosGkortsilasOAePEg3V93AUnsplash"],
  ["Storey Flats", "Queens", "imgZaneLeeTFtRnrzkqn0Unsplash"],
  ["Villas", "Brooklyn", "imgGianGomezObuzUaqXuNiUnsplash"],
  ["Royal Villas", "Staten Island", "imgJoelFilipeRfdp780V5AUnsplash"],
  ["Victorian", "Bronx Island", "imgErkanKirdarVn1VQ54Bm1GUnsplash1"],
  ["Tropical Tower", "Queens", "imgRobertoNicksonSo3WgJLwDxoUnsplash"],
];

/** Editorial Figma imagery, deliberately separate from the live property catalogue. */
export function LandingResidences() {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.current?.scrollBy({ left: direction * rail.current.clientWidth, behavior: reducedMotion ? "instant" : "smooth" });
  };
  return (
    <section className="landing-residences" aria-labelledby="landing-residences-title">
      <div className="landing-section-heading">
        <div>
          <h2 id="landing-residences-title">Inspirations résidentielles</h2>
          <p>Une sélection d’architectures pour imaginer votre prochain chez-vous.</p>
        </div>
        <div className="landing-rail-controls">
          <Button variant="ghost" size="icon" onClick={() => scroll(-1)} aria-label="Voir les inspirations précédentes" aria-controls="landing-residence-rail">
            <img src="/images/landing/imgArrowSquareLeft.svg" width="24" height="24" alt="" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => scroll(1)} aria-label="Voir les inspirations suivantes" aria-controls="landing-residence-rail">
            <img src="/images/landing/imgArrowRight.svg" width="24" height="24" alt="" />
          </Button>
        </div>
      </div>
      <div ref={rail} id="landing-residence-rail" className="landing-residence-rail" tabIndex={0} role="region" aria-label="Galerie d’inspirations architecturales">
        {residences.map(([title, location, asset]) => (
          <Card key={asset} className="landing-residence-card">
            <div className="landing-residence-image">
              <img src={`/images/landing/${asset}.png`} alt={`${title}, ${location}`} width="186" height="190" loading="lazy" decoding="async" />
            </div>
            <CardContent className="landing-residence-caption">
              <h3>{title}</h3>
              <p>{location}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <a className="landing-catalogue-link" href="#landing-catalogue">Découvrir les biens Dwira →</a>
    </section>
  );
}

export function LandingStats({ propertyCount, locationCount, loading }: { propertyCount: number; locationCount: number; loading: boolean }) {
  return (
    <section className="landing-stats landing-section" aria-labelledby="landing-stats-title">
      <h2 id="landing-stats-title">Votre recherche commence ici</h2>
      <dl className="landing-stat-grid" aria-busy={loading}>
        <div><dt>Biens dans notre catalogue</dt><dd>{loading ? "—" : propertyCount.toLocaleString("fr-FR")}</dd></div>
        <div><dt>Localités représentées</dt><dd>{loading ? "—" : locationCount.toLocaleString("fr-FR")}</dd></div>
        <div><dt>Une équipe à vos côtés</dt><dd>Kélibia</dd></div>
      </dl>
    </section>
  );
}

export function LandingTestimonials() {
  return (
    <section className="landing-testimonials landing-section" aria-labelledby="landing-testimonials-title">
      <Card className="landing-testimonial-card">
        <CardContent>
          <h2 id="landing-testimonials-title">Votre expérience compte</h2>
          <p>Vous avez acheté, vendu ou séjourné avec Dwira ? Partagez votre expérience avec notre équipe.</p>
          <Button asChild><Link to="/contact">Partager mon expérience</Link></Button>
        </CardContent>
      </Card>
    </section>
  );
}
