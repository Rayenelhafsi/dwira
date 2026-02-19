import { Mail, Phone, MapPin, Send } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="bg-white pt-24 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-emerald-900 mb-4">Contactez-nous</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Vous avez un projet immobilier ? Achat, vente, location ou gestion, 
            l'équipe de <strong>Dwira Immobilier</strong> est à votre écoute pour vous accompagner.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Envoyez-nous un message</h2>
            <form className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">Prénom</label>
                  <input type="text" id="firstName" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors" placeholder="Votre prénom" />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
                  <input type="text" id="lastName" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors" placeholder="Votre nom" />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input type="email" id="email" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors" placeholder="votre@email.com" />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                <input type="tel" id="phone" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors" placeholder="+216 52 080 695" />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea id="message" rows={5} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-colors" placeholder="Comment pouvons-nous vous aider ?"></textarea>
              </div>

              <button type="submit" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-lg transition-colors shadow-lg transform hover:-translate-y-0.5 duration-200">
                <Send size={18} />
                <span>Envoyer le message</span>
              </button>
            </form>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Informations de contact</h2>
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Notre Adresse</h3>
                  <a href="https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-emerald-600 transition-colors block">
                    Rue Ibn Khaldoun,<br />
                    Kélibia 8090, Tunisie
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Téléphone</h3>
                  <a href="tel:+21652080695" className="text-gray-600 hover:text-emerald-600 transition-colors block">+216 52 080 695</a>
                  <p className="text-gray-500 text-sm mt-1">Disponible sur WhatsApp</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Email</h3>
                  <a href="mailto:contact@dwira-immobilier.com" className="text-gray-600 hover:text-emerald-600 transition-colors block">contact@dwira-immobilier.com</a>
                  <p className="text-gray-500 text-sm mt-1">Réponse sous 24h</p>
                </div>
              </div>
            </div>

            {/* Map Placeholder */}
            <div className="mt-8 h-64 bg-gray-200 rounded-2xl overflow-hidden relative border border-gray-200 shadow-inner">
               <a href="https://maps.app.goo.gl/1ajusb4v6eQGp6WJ9" target="_blank" rel="noreferrer" className="block h-full w-full">
                 <img 
                   src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1600&auto=format&fit=crop" 
                   alt="Carte de localisation" 
                   className="w-full h-full object-cover opacity-60 hover:opacity-70 transition-opacity" 
                 />
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg font-bold text-emerald-900 shadow-lg flex items-center gap-2">
                      <MapPin size={18} className="text-red-500" />
                      Voir sur Google Maps
                    </span>
                 </div>
               </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
