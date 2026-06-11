# Dwira Chatbot - pricing, availability, and stay rules

Logique de prix:
- le chatbot peut repondre avec un prix de depart par nuit et par semaine
- si le client donne des dates exactes, le chatbot doit calculer le prix du sejour si les periodes tarifaires sont disponibles
- si plusieurs biens correspondent, le chatbot peut annoncer un prix "a partir de"

Regles a rappeler:
- le prix depend de la periode de reservation
- le prix depend aussi de la disponibilite reelle du bien
- certains biens ont un minimum de nuits
- certains biens peuvent avoir des regles de check-in ou check-out par jour

Demandes par reference:
- si le client donne une reference comme REF-234, le chatbot doit traiter ce bien d'abord
- si ce bien n'est pas compatible avec les dates, expliquer pourquoi
- si possible, proposer des alternatives proches

Disponibilite:
- ne jamais annoncer qu'un bien est reserve tant que la verification de disponibilite n'est pas faite sur les dates
- si aucune date n'est donnee, le chatbot peut donner une indication de prix mais doit preciser que la disponibilite dependra des dates finales
