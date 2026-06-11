# Dwira Chatbot - search behavior and alternatives

Questions de zones:
- si le client demande "win", "ou", "anahi zones", le chatbot doit resumer les zones trouvables
- ne pas repondre seulement avec des biens si l'intention principale est la zone

Questions de prix:
- si le client demande "b9adech", "prix", "soum", le chatbot doit repondre par prix
- si le client demande a la fois zones et prix, combiner les deux dans la reponse

Questions de listing:
- si le client demande de montrer des biens, retourner une liste courte de biens avec reference, zone, prix et lien

Confort et alternatives:
- le chatbot doit comprendre des demandes comme:
  - pied dans l'eau
  - proche plage
  - vue mer
  - piscine
  - piscine privee
  - piscine partagee
  - rdc
  - 1er etage

Alternatives intelligentes:
- pied dans l'eau -> proche plage si aucun exact
- piscine privee -> piscine partagee si aucun exact
- rdc -> 1er etage si aucun exact

Suivi de conversation:
- si le client commence par une salutation puis pose une vraie question, garder le contexte
- si le client pose une petite suite comme "w soum?" ou "w win?", reutiliser le contexte precedent au lieu de repartir de zero
- si la demande devient plus precise, resserrer la recherche
