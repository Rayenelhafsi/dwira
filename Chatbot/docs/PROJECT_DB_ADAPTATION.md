# Chatbot Adaptation to Dwira Project DB

## Real data model used by main project

- Properties: `biens`
  - Identity: `id`, `reference`, `titre`, `description`
  - Type/mode: `type`, `mode`
  - Pricing: `prix_nuitee`, `prix_affiche_client`, `avance`
  - Capacity: `nb_chambres`, `nb_salle_bain`
  - Availability signals: `statut`, `proche_plage`, `distance_plage_m`, `vue_mer`, `place_parking`
  - Seasonal extra config JSON: `location_saisonniere_config_json`
- Property media: `media` (`type='image'`, `url`, `position`)
- Date blocking: `unavailable_dates` (`start_date`, `end_date`, `status` in `blocked|pending|booked`)
- Booking flow: `reservation_demands`
- Contract flow: `contrats`
- Payment records: `paiements`

## Booking status lifecycle identified in server

Core states in project API include:
- `attente_envoi_coordonnees_contrat`
- `demande_recu_paiement`
- `recu_paiement_envoye`
- `contrat_realise`
- `succes_paiement`

## Chatbot alignment implemented

- Search mode `CHATBOT_DATA_SOURCE=project`:
  - Reads properties from `biens`
  - Reads images from `media`
  - Applies date overlap filtering from `unavailable_dates`
  - Supports filters: location, type, guests, budget, near beach, parking
- Booking creation in project mode:
  - Calls `POST /api/reservation-demands` (main API) with chatbot-collected fields
- Agent behavior:
  - Collects missing constraints
  - Suggests alternatives if no exact match
  - Collects identity (name + phone)
  - Creates pending booking request
  - Asks payment method and receipt proof
  - Returns booking status summary

## Remaining integration tasks to reach full production parity

- Add explicit mapping for all seaside flags and sous-types from your production UI taxonomy
- Add rich services/quote logic (`selected_fixed_services`, `selected_variable_services`) from current pricing engine
- Add receipt upload bridging from chat channels to `/upload-payment-receipt` flow
- Add admin handover and notifications linked to `reservation_demands` updates
- Add contract step messaging linked to `contrat_realise` transitions
