Fichiers inclus :

1) AgencySeasonalContractTemplate.jsx
   - Composant React prêt pour un projet Vite
   - Design A4 moderne, minimaliste, sans logo
   - Prévu pour remplissage dynamique par code
   - Optimisé pour impression / export PDF

2) contractSampleData.js
   - Exemple d'objet data à injecter dans le composant

Exemple d'utilisation :

import AgencySeasonalContractTemplate from './AgencySeasonalContractTemplate';
import { contractSampleData } from './contractSampleData';

export default function App() {
  return <AgencySeasonalContractTemplate data={contractSampleData} />;
}

Conseil :
- Pour générer un PDF côté front, utilisez window.print() ou une librairie comme react-to-print.
- Gardez les valeurs déjà formatées côté back/front (dates, montants, etc.).
