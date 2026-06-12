import { Mail, Phone, MapPin, Send, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function ContactPage() {
  const navigate = useNavigate();
  const googleMapsLink = "https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9";
  const googleEmbedUrl = "https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d413.8206848863775!2d11.090416429020472!3d36.84740522692526!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zMzbCsDUwJzUwLjkiTiAxMcKwMDUnMjYuNSJF!5e1!3m2!1sfr!2stn!4v1773706940714!5m2!1sfr!2stn";
  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <div className="bg-white pb-20 pt-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
            Retour
          </button>
        </div>
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold text-emerald-900">Contactez-nous</h1>
          <p className="mx-auto max-w-2xl text-gray-600">
            Vous avez un projet immobilier ? Achat, vente, location ou gestion,
            l'equipe de <strong>Dwira Immobilier</strong> est a votre ecoute pour vous accompagner.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:gap-24">
          <div>
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Envoyez-nous un message</h2>
            <form className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-gray-700">Prenom</label>
                  <input type="text" id="firstName" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition-colors focus:ring-2 focus:ring-emerald-500" placeholder="Votre prenom" />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-gray-700">Nom</label>
                  <input type="text" id="lastName" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition-colors focus:ring-2 focus:ring-emerald-500" placeholder="Votre nom" />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                <input type="email" id="email" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition-colors focus:ring-2 focus:ring-emerald-500" placeholder="votre@email.com" />
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-medium text-gray-700">Telephone</label>
                <input type="tel" id="phone" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition-colors focus:ring-2 focus:ring-emerald-500" placeholder="+216 52 080 695" />
              </div>

              <div>
                <label htmlFor="message" className="mb-2 block text-sm font-medium text-gray-700">Message</label>
                <textarea id="message" rows={5} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none transition-colors focus:ring-2 focus:ring-emerald-500" placeholder="Comment pouvons-nous vous aider ?" />
              </div>

              <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg transition-colors duration-200 hover:-translate-y-0.5 hover:bg-emerald-700">
                <Send size={18} />
                <span>Envoyer le message</span>
              </button>
            </form>
          </div>

          <div>
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Informations de contact</h2>
            <div className="space-y-8 rounded-2xl border border-gray-100 bg-gray-50 p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-gray-900">Notre Adresse</h3>
                  <a href={googleMapsLink} target="_blank" rel="noreferrer" className="block text-gray-600 transition-colors hover:text-emerald-600">
                    Rue Ibn Khaldoun,
                    <br />
                    Kelibia 8090, Tunisie
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-gray-900">Telephone</h3>
                  <a href="tel:+21652080695" className="block text-gray-600 transition-colors hover:text-emerald-600">+216 52 080 695</a>
                  <p className="mt-1 text-sm text-gray-500">Disponible sur WhatsApp</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold text-gray-900">Email</h3>
                  <a href="mailto:dwiraimmobilier@gmail.com" className="block text-gray-600 transition-colors hover:text-emerald-600">dwiraimmobilier@gmail.com</a>
                  <p className="mt-1 text-sm text-gray-500">Reponse sous 24h</p>
                </div>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-inner">
              <div className="relative h-72">
                <iframe
                  title="Carte Google Maps Dwira Immobilier"
                  src={googleEmbedUrl}
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/80 to-transparent p-4">
                  <div className="flex justify-center">
                    <a
                      href={googleMapsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2 font-bold text-emerald-900 shadow-lg ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
                    >
                      <MapPin size={18} className="text-red-500" />
                      Voir sur Google Maps
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
