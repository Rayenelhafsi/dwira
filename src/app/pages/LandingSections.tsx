import { Link } from "react-router";
import { Building2, Handshake, MapPinned } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export function LandingStats({ propertyCount, locationCount, loading }: { propertyCount: number; locationCount: number; loading: boolean }) {
  const stats = [
    { label: "Biens actifs", value: loading ? "..." : propertyCount.toLocaleString("fr-FR"), icon: Building2, text: "Catalogue verifie et pret a visiter." },
    { label: "Localites", value: loading ? "..." : locationCount.toLocaleString("fr-FR"), icon: MapPinned, text: "Recherche par zones utiles, pas par listes interminables." },
    { label: "Accompagnement", value: "Kelibia", icon: Handshake, text: "Une equipe locale pour achat, vente et sejour." },
  ];

  return (
    <section className="landing-stats landing-section" aria-labelledby="landing-stats-title">
      <div className="landing-stats-heading">
        <p>Recherche guidee</p>
        <h2 id="landing-stats-title">Votre projet avance avec des reperes clairs</h2>
      </div>
      <dl className="landing-stat-grid" aria-busy={loading}>
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label}>
              <span className="landing-stat-icon"><Icon size={34} /></span>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
              <p>{item.text}</p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function LandingTestimonials() {
  return (
    <section className="landing-testimonials landing-section" aria-labelledby="landing-testimonials-title">
      <Card className="landing-testimonial-card">
        <CardContent>
          <h2 id="landing-testimonials-title">Votre experience compte</h2>
          <p>Vous avez achete, vendu ou sejourne avec Dwira ? Partagez votre experience avec notre equipe.</p>
          <Button asChild><Link to="/contact">Partager mon experience</Link></Button>
        </CardContent>
      </Card>
    </section>
  );
}
