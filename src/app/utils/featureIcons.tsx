import type { ReactNode } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import AccessibleOutlinedIcon from '@mui/icons-material/AccessibleOutlined';
import DeckOutlinedIcon from '@mui/icons-material/DeckOutlined';
import LocalLaundryServiceOutlinedIcon from '@mui/icons-material/LocalLaundryServiceOutlined';
import KingBedOutlinedIcon from '@mui/icons-material/KingBedOutlined';
import WhatshotOutlinedIcon from '@mui/icons-material/WhatshotOutlined';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import LocalParkingOutlinedIcon from '@mui/icons-material/LocalParkingOutlined';
import TvOutlinedIcon from '@mui/icons-material/TvOutlined';
import PoolOutlinedIcon from '@mui/icons-material/PoolOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined';
import SmokingRoomsOutlinedIcon from '@mui/icons-material/SmokingRoomsOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import BathtubOutlinedIcon from '@mui/icons-material/BathtubOutlined';
import CoffeeMakerOutlinedIcon from '@mui/icons-material/CoffeeMakerOutlined';
import LandscapeOutlinedIcon from '@mui/icons-material/LandscapeOutlined';
import DeskOutlinedIcon from '@mui/icons-material/DeskOutlined';
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import BalconyOutlinedIcon from '@mui/icons-material/BalconyOutlined';
import BeachAccessOutlinedIcon from '@mui/icons-material/BeachAccessOutlined';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import DoorFrontOutlinedIcon from '@mui/icons-material/DoorFrontOutlined';
import ShowerOutlinedIcon from '@mui/icons-material/ShowerOutlined';
import MicrowaveOutlinedIcon from '@mui/icons-material/MicrowaveOutlined';
import KitchenOutlinedIcon from '@mui/icons-material/KitchenOutlined';
import WeekendOutlinedIcon from '@mui/icons-material/WeekendOutlined';
import AirOutlinedIcon from '@mui/icons-material/AirOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export const FEATURE_ICON_OPTIONS = [
  { value: '', label: 'Automatique' },
  { value: 'key', label: 'Clé / check-in' },
  { value: 'accessibility', label: 'Accessibilité' },
  { value: 'balcony', label: 'Balcon' },
  { value: 'deck', label: 'Terrasse / transat' },
  { value: 'beach', label: 'Plage / mer' },
  { value: 'laundry', label: 'Buanderie / lave-linge' },
  { value: 'bed', label: 'Lit / chambre' },
  { value: 'hanger', label: 'Linge / cintres' },
  { value: 'heat', label: 'Chauffage' },
  { value: 'ac', label: 'Climatisation' },
  { value: 'kitchen', label: 'Cuisine' },
  { value: 'microwave', label: 'Micro-ondes' },
  { value: 'coffee', label: 'Café / bouilloire' },
  { value: 'wifi', label: 'Wifi / internet' },
  { value: 'parking', label: 'Parking / garage' },
  { value: 'tv', label: 'TV / streaming' },
  { value: 'pool', label: 'Piscine / spa' },
  { value: 'garden', label: 'Jardin / cour' },
  { value: 'pets', label: 'Animaux' },
  { value: 'smoking', label: 'Fumeurs' },
  { value: 'security', label: 'Sécurité' },
  { value: 'bath', label: 'Salle de bain' },
  { value: 'shower', label: 'Douche' },
  { value: 'view', label: 'Vue / paysage' },
  { value: 'desk', label: 'Bureau / travail' },
  { value: 'services', label: 'Services / ménage' },
  { value: 'building', label: 'Immeuble / ascenseur' },
  { value: 'door', label: 'Porte / entrée' },
  { value: 'sofa', label: 'Salon / confort' },
  { value: 'fan', label: 'Ventilation' },
  { value: 'lock', label: 'Coffre / verrou' },
  { value: 'check', label: 'Validation / générique' },
] as const;

const iconStyle = { fontSize: 22 } as const;
const iconClassName = 'text-gray-800';

const normalize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function renderNamedIcon(iconName?: string | null): ReactNode | null {
  switch (String(iconName || '').trim()) {
    case 'key': return <VpnKeyOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'accessibility': return <AccessibleOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'balcony': return <BalconyOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'deck': return <DeckOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'beach': return <BeachAccessOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'laundry': return <LocalLaundryServiceOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'bed': return <KingBedOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'hanger': return <CheckroomOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'heat': return <WhatshotOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'ac': return <AcUnitOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'kitchen': return <KitchenOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'microwave': return <MicrowaveOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'coffee': return <CoffeeMakerOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'wifi': return <WifiOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'parking': return <LocalParkingOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'tv': return <TvOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'pool': return <PoolOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'garden': return <YardOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'pets': return <PetsOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'smoking': return <SmokingRoomsOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'security': return <SecurityOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'bath': return <BathtubOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'shower': return <ShowerOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'view': return <LandscapeOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'desk': return <DeskOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'services': return <CleaningServicesOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'building': return <ApartmentOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'door': return <DoorFrontOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'sofa': return <WeekendOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'fan': return <AirOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'lock': return <LockOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'restaurant': return <RestaurantOutlinedIcon className={iconClassName} style={iconStyle} />;
    case 'check': return <CheckIcon className={iconClassName} style={iconStyle} />;
    default: return null;
  }
}

export function getFeatureIconElement(iconName?: string | null, featureName?: string | null, tabName?: string | null): ReactNode {
  const selected = renderNamedIcon(iconName);
  if (selected) return selected;

  const key = normalize(featureName || '');
  const tabKey = normalize(String(tabName || '').replace(/^\s*\d+\s*[\.\-:)]\s*/g, '').trim());

  if (key.includes('self check') || key.includes('boite a cles') || key.includes('boite à cles') || key.includes('code') || key.includes('badge') || key.includes('cle') || key.includes('clé')) return renderNamedIcon('key');
  if (key.includes('accessibil') || key.includes('largeur portes') || key.includes('pmr') || key.includes('barres d appui') || key.includes('barres d\'appui') || key.includes('sans marche') || key.includes('douche accessible')) return renderNamedIcon('accessibility');
  if (key.includes('transat') || key.includes('terrasse') || key.includes('balcon') || key.includes('parasol') || key.includes('mobilier exterieur') || key.includes('mobilier extérieur') || key.includes('hamac')) return renderNamedIcon('deck');
  if (key.includes('lave-linge') || key.includes('lave linge') || key.includes('seche-linge') || key.includes('seche linge') || key.includes('lessive') || key.includes('etendoir') || key.includes('étendoir') || key.includes('panier a linge') || key.includes('panier à linge')) return renderNamedIcon('laundry');
  if (key.includes('oreiller') || key.includes('couverture') || key.includes('linge') || key.includes('lit ') || key.startsWith('lit') || key.includes('drap') || key.includes('chambre')) return renderNamedIcon('bed');
  if (key.includes('cintre') || key.includes('penderie') || key.includes('placard') || key.includes('rangement')) return renderNamedIcon('hanger');
  if (key.includes('chauffage') || key.includes('gaz')) return renderNamedIcon('heat');
  if (key.includes('clim') || key.includes('ventilat') || key.includes('deshumid')) return renderNamedIcon('ac');
  if (key.includes('cuisine') || key.includes('four') || key.includes('micro') || key.includes('frigo') || key.includes('refrigerateur') || key.includes('réfrigérateur') || key.includes('ustensiles') || key.includes('vaisselle')) return renderNamedIcon('kitchen');
  if (key.includes('cafe') || key.includes('café') || key.includes('bouilloire') || key.includes('grille-pain') || key.includes('grille pain') || key.includes('blender')) return renderNamedIcon('coffee');
  if (key.includes('wifi') || key.includes('internet') || key.includes('ethernet') || key.includes('booster wifi')) return renderNamedIcon('wifi');
  if (key.includes('parking') || key.includes('garage') || key.includes('voiture') || key.includes('stationnement')) return renderNamedIcon('parking');
  if (key.includes('tv') || key.includes('tele') || key.includes('télé') || key.includes('stream') || key.includes('netflix') || key.includes('iptv') || key.includes('satellite')) return renderNamedIcon('tv');
  if (key.includes('piscine') || key.includes('jacuzzi') || key.includes('spa') || key.includes('sauna') || key.includes('hammam')) return renderNamedIcon('pool');
  if (key.includes('jardin') || key.includes('cour') || key.includes('patio') || key.includes('pergola') || key.includes('gazon')) return renderNamedIcon('garden');
  if (key.includes('animaux')) return renderNamedIcon('pets');
  if (key.includes('fumeurs')) return renderNamedIcon('smoking');
  if (key.includes('secur') || key.includes('detecteur') || key.includes('détecteur') || key.includes('camera') || key.includes('caméra') || key.includes('coffre') || key.includes('extincteur') || key.includes('trousse')) return renderNamedIcon('security');
  if (key.includes('douche')) return renderNamedIcon('shower');
  if (key.includes('baignoire') || key.includes('bidet') || key.includes('eau chaude') || key.includes('salle de bain')) return renderNamedIcon('bath');
  if (key.includes('vue') || key.includes('mer') || key.includes('plage') || key.includes('montagne') || key.includes('vallee') || key.includes('vallée') || key.includes('ville') || key.includes('panoram')) return renderNamedIcon('view');
  if (key.includes('travail') || key.includes('bureau') || key.includes('espace de travail')) return renderNamedIcon('desk');
  if (key.includes('service') || key.includes('menage') || key.includes('ménage') || key.includes('concierge') || key.includes('transfert') || key.includes('petit dejeuner') || key.includes('petit déjeuner')) return renderNamedIcon('services');
  if (key.includes('ascenseur')) return renderNamedIcon('building');
  if (key.includes('porte') || key.includes('entree') || key.includes('entrée')) return renderNamedIcon('door');

  if (tabKey.includes('check-in') || tabKey.includes('check in') || tabKey.includes('acces')) return renderNamedIcon('key');
  if (tabKey.includes('accessibil')) return renderNamedIcon('accessibility');
  if (tabKey.includes('exterieur') || tabKey.includes('extérieur') || tabKey.includes('balcon') || tabKey.includes('terrasse')) return renderNamedIcon('deck');
  if (tabKey.includes('buanderie')) return renderNamedIcon('laundry');
  if (tabKey.includes('linge') || tabKey.includes('lits')) return renderNamedIcon('bed');
  if (tabKey.includes('chauffage') || tabKey.includes('climatisation')) return renderNamedIcon('heat');
  if (tabKey.includes('cuisine')) return renderNamedIcon('kitchen');
  if (tabKey.includes('divertissement')) return renderNamedIcon('tv');
  if (tabKey.includes('secur')) return renderNamedIcon('security');
  if (tabKey.includes('localisation') || tabKey.includes('vue')) return renderNamedIcon('view');
  if (tabKey.includes('confort') || tabKey.includes('bonus')) return renderNamedIcon('sofa');

  return renderNamedIcon('check');
}
