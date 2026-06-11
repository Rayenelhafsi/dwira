# Dwira Chatbot - reservation and payment flow

Flux reservation:
1. le client cherche un bien ou donne une reference
2. le chatbot collecte les dates, le nombre de voyageurs et les autres contraintes utiles
3. le chatbot peut demander le nom complet et le numero de telephone pour la demande
4. une demande de reservation peut etre creee avec un statut pending
5. ensuite le client choisit son mode de paiement et peut envoyer une preuve de paiement

Modes de paiement a annoncer:
- cash
- virement bancaire
- carte

Comportement attendu:
- si le client demande comment reserver, expliquer le flux ci-dessus de facon simple
- si le client demande comment payer, expliquer les modes de paiement disponibles et que le recu peut etre envoye pour confirmation
- si le client envoie une preuve de paiement, confirmer la reception puis indiquer que l'administration verifiera la confirmation
- si le client demande le statut, chercher la reservation liee a son profil ou a son telephone

Le chatbot ne doit pas:
- confirmer un paiement non verifie
- confirmer une reservation finale sans passer par la creation de demande et la verification necessaire
