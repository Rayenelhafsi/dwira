import { getOne, getAll, execute } from '../../lib/db';
import { Bien, Media } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface BienRow extends RowDataPacket, Bien {}
interface MediaRow extends RowDataPacket, Media {}

export interface CreateBienInput {
  id: string;
  reference: string;
  titre: string;
  description?: string;
  mode: 'vente' | 'location_annuelle' | 'location_saisonniere';
  type: 'appartement' | 'villa_maison' | 'studio' | 'immeuble' | 'terrain' | 'local_commercial' | 'bungalow' | 'S1' | 'S2' | 'S3' | 'S4' | 'villa' | 'local';
  nb_chambres: number;
  nb_salle_bain: number;
  prix_nuitee: number;
  tarification_methode?: 'avec_commission' | 'sans_commission' | null;
  prix_affiche_client?: number | null;
  prix_fixe_proprietaire?: number | null;
  prix_final?: number | null;
  revenu_agence?: number | null;
  commission_pourcentage_proprietaire?: number | null;
  commission_pourcentage_client?: number | null;
  montant_max_reduction_negociation?: number | null;
  prix_minimum_accepte?: number | null;
  modalite_paiement_vente?: 'comptant' | 'facilite' | null;
  pourcentage_premiere_partie_promesse?: number | null;
  montant_premiere_partie_promesse?: number | null;
  montant_deuxieme_partie?: number | null;
  nombre_tranches?: number | null;
  periode_tranches_mois?: number | null;
  montant_par_tranche?: number | null;
  avance: number;
  caution?: number;
  type_rue?: 'piste' | 'route_goudronnee' | 'rue_residentielle' | null;
  type_papier?: 'titre_foncier_individuel' | 'titre_foncier_collectif' | 'contrat_seulement' | 'sans_papier' | null;
  superficie_m2?: number | null;
  etage?: number | null;
  configuration?: string | null;
  annee_construction?: number | null;
  distance_plage_m?: number | null;
  proche_plage?: boolean;
  chauffage_central?: boolean;
  climatisation?: boolean;
  balcon?: boolean;
  terrasse?: boolean;
  ascenseur?: boolean;
  vue_mer?: boolean;
  gaz_ville?: boolean;
  cuisine_equipee?: boolean;
  place_parking?: boolean;
  syndic?: boolean;
  meuble?: boolean;
  independant?: boolean;
  eau_puits?: boolean;
  eau_sonede?: boolean;
  electricite_steg?: boolean;
  surface_local_m2?: number | null;
  facade_m?: number | null;
  hauteur_plafond_m?: number | null;
  activite_recommandee?: string | null;
  toilette?: boolean;
  reserve_local?: boolean;
  vitrine?: boolean;
  coin_angle?: boolean;
  electricite_3_phases?: boolean;
  alarme?: boolean;
  type_terrain?: 'agricole' | 'habitation' | 'industrielle' | 'loisir' | null;
  terrain_facade_m?: number | null;
  terrain_surface_m2?: number | null;
  terrain_distance_plage_m?: number | null;
  terrain_zone?: string | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
  immeuble_details_json?: string | null;
  immeuble_appartements_json?: string | null;
  statut?: 'disponible' | 'loue' | 'reserve' | 'maintenance';
  menage_en_cours?: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  caracteristique_ids?: string[];
  date_ajout: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateBienInput {
  reference?: string;
  titre?: string;
  description?: string;
  mode?: 'vente' | 'location_annuelle' | 'location_saisonniere';
  type?: 'appartement' | 'villa_maison' | 'studio' | 'immeuble' | 'terrain' | 'local_commercial' | 'bungalow' | 'S1' | 'S2' | 'S3' | 'S4' | 'villa' | 'local';
  nb_chambres?: number;
  nb_salle_bain?: number;
  prix_nuitee?: number;
  tarification_methode?: 'avec_commission' | 'sans_commission' | null;
  prix_affiche_client?: number | null;
  prix_fixe_proprietaire?: number | null;
  prix_final?: number | null;
  revenu_agence?: number | null;
  commission_pourcentage_proprietaire?: number | null;
  commission_pourcentage_client?: number | null;
  montant_max_reduction_negociation?: number | null;
  prix_minimum_accepte?: number | null;
  modalite_paiement_vente?: 'comptant' | 'facilite' | null;
  pourcentage_premiere_partie_promesse?: number | null;
  montant_premiere_partie_promesse?: number | null;
  montant_deuxieme_partie?: number | null;
  nombre_tranches?: number | null;
  periode_tranches_mois?: number | null;
  montant_par_tranche?: number | null;
  avance?: number;
  caution?: number;
  type_rue?: 'piste' | 'route_goudronnee' | 'rue_residentielle' | null;
  type_papier?: 'titre_foncier_individuel' | 'titre_foncier_collectif' | 'contrat_seulement' | 'sans_papier' | null;
  superficie_m2?: number | null;
  etage?: number | null;
  configuration?: string | null;
  annee_construction?: number | null;
  distance_plage_m?: number | null;
  proche_plage?: boolean;
  chauffage_central?: boolean;
  climatisation?: boolean;
  balcon?: boolean;
  terrasse?: boolean;
  ascenseur?: boolean;
  vue_mer?: boolean;
  gaz_ville?: boolean;
  cuisine_equipee?: boolean;
  place_parking?: boolean;
  syndic?: boolean;
  meuble?: boolean;
  independant?: boolean;
  eau_puits?: boolean;
  eau_sonede?: boolean;
  electricite_steg?: boolean;
  surface_local_m2?: number | null;
  facade_m?: number | null;
  hauteur_plafond_m?: number | null;
  activite_recommandee?: string | null;
  toilette?: boolean;
  reserve_local?: boolean;
  vitrine?: boolean;
  coin_angle?: boolean;
  electricite_3_phases?: boolean;
  alarme?: boolean;
  type_terrain?: 'agricole' | 'habitation' | 'industrielle' | 'loisir' | null;
  terrain_facade_m?: number | null;
  terrain_surface_m2?: number | null;
  terrain_distance_plage_m?: number | null;
  terrain_zone?: string | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
  immeuble_details_json?: string | null;
  immeuble_appartements_json?: string | null;
  statut?: 'disponible' | 'loue' | 'reserve' | 'maintenance';
  menage_en_cours?: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  caracteristique_ids?: string[];
}

/**
 * Get all biens
 */
export async function getAllBiens(): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql);
  return rows as unknown as Bien[];
}

/**
 * Get bien by ID
 */
export async function getBienById(id: string): Promise<Bien | undefined> {
  const sql = 'SELECT * FROM biens WHERE id = ?';
  const row = await getOne<BienRow>(sql, [id]);
  return row as unknown as Bien | undefined;
}

/**
 * Get bien by reference
 */
export async function getBienByReference(reference: string): Promise<Bien | undefined> {
  const sql = 'SELECT * FROM biens WHERE reference = ?';
  const row = await getOne<BienRow>(sql, [reference]);
  return row as unknown as Bien | undefined;
}

/**
 * Get biens by zone
 */
export async function getBiensByZone(zoneId: string): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE zone_id = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [zoneId]);
  return rows as unknown as Bien[];
}

/**
 * Get biens by proprietaire
 */
export async function getBiensByProprietaire(proprietaireId: string): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE proprietaire_id = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [proprietaireId]);
  return rows as unknown as Bien[];
}

/**
 * Get biens by statut
 */
export async function getBiensByStatut(statut: 'disponible' | 'loue' | 'reserve' | 'maintenance'): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE statut = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [statut]);
  return rows as unknown as Bien[];
}

/**
 * Get available biens (disponible)
 */
export async function getAvailableBiens(): Promise<Bien[]> {
  const sql = "SELECT * FROM biens WHERE statut = 'disponible' ORDER BY date_ajout DESC";
  const rows = await getAll<BienRow>(sql);
  return rows as unknown as Bien[];
}

/**
 * Create a new bien
 */
export async function createBien(data: CreateBienInput): Promise<number> {
  const sql = `
    INSERT INTO biens (id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain, 
      prix_nuitee, avance, caution, type_rue, type_papier, superficie_m2, etage, configuration, annee_construction, distance_plage_m,
      proche_plage, chauffage_central, climatisation, balcon, terrasse, ascenseur, vue_mer, gaz_ville, cuisine_equipee, place_parking,
      syndic, meuble, independant, eau_puits, eau_sonede, electricite_steg, surface_local_m2, facade_m, hauteur_plafond_m, activite_recommandee, toilette, reserve_local, vitrine, coin_angle, electricite_3_phases, alarme,
      type_terrain, terrain_facade_m, terrain_surface_m2, terrain_distance_plage_m, terrain_zone, terrain_constructible, terrain_angle, immeuble_details_json, immeuble_appartements_json, statut, menage_en_cours, zone_id, proprietaire_id, date_ajout, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await execute(sql, [
    data.id,
    data.reference,
    data.titre,
    data.description || null,
    data.mode,
    data.type,
    data.nb_chambres,
    data.nb_salle_bain,
    data.prix_nuitee,
    data.avance,
    data.caution || 0,
    data.type_rue || null,
    data.type_papier || null,
    data.superficie_m2 ?? null,
    data.etage ?? null,
    data.configuration ?? null,
    data.annee_construction ?? null,
    data.distance_plage_m ?? null,
    data.proche_plage ? 1 : 0,
    data.chauffage_central ? 1 : 0,
    data.climatisation ? 1 : 0,
    data.balcon ? 1 : 0,
    data.terrasse ? 1 : 0,
    data.ascenseur ? 1 : 0,
    data.vue_mer ? 1 : 0,
    data.gaz_ville ? 1 : 0,
    data.cuisine_equipee ? 1 : 0,
    data.place_parking ? 1 : 0,
    data.syndic ? 1 : 0,
    data.meuble ? 1 : 0,
    data.independant ? 1 : 0,
    data.eau_puits ? 1 : 0,
    data.eau_sonede ? 1 : 0,
    data.electricite_steg ? 1 : 0,
    data.surface_local_m2 ?? null,
    data.facade_m ?? null,
    data.hauteur_plafond_m ?? null,
    data.activite_recommandee ?? null,
    data.toilette ? 1 : 0,
    data.reserve_local ? 1 : 0,
    data.vitrine ? 1 : 0,
    data.coin_angle ? 1 : 0,
    data.electricite_3_phases ? 1 : 0,
    data.alarme ? 1 : 0,
    data.type_terrain ?? null,
    data.terrain_facade_m ?? null,
    data.terrain_surface_m2 ?? null,
    data.terrain_distance_plage_m ?? null,
    data.terrain_zone ?? null,
    data.terrain_constructible ? 1 : 0,
    data.terrain_angle ? 1 : 0,
    data.immeuble_details_json ?? null,
    data.immeuble_appartements_json ?? null,
    data.statut || 'disponible',
    data.menage_en_cours || false,
    data.zone_id || null,
    data.proprietaire_id || null,
    data.date_ajout,
    data.created_at,
    data.updated_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing bien
 */
export async function updateBien(id: string, data: UpdateBienInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | boolean | null | undefined)[] = [];

  if (data.reference !== undefined) {
    fields.push('reference = ?');
    values.push(data.reference);
  }
  if (data.titre !== undefined) {
    fields.push('titre = ?');
    values.push(data.titre);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.mode !== undefined) {
    fields.push('mode = ?');
    values.push(data.mode);
  }
  if (data.nb_chambres !== undefined) {
    fields.push('nb_chambres = ?');
    values.push(data.nb_chambres);
  }
  if (data.nb_salle_bain !== undefined) {
    fields.push('nb_salle_bain = ?');
    values.push(data.nb_salle_bain);
  }
  if (data.prix_nuitee !== undefined) {
    fields.push('prix_nuitee = ?');
    values.push(data.prix_nuitee);
  }
  if (data.avance !== undefined) {
    fields.push('avance = ?');
    values.push(data.avance);
  }
  if (data.caution !== undefined) {
    fields.push('caution = ?');
    values.push(data.caution);
  }
  if (data.type_rue !== undefined) {
    fields.push('type_rue = ?');
    values.push(data.type_rue);
  }
  if (data.type_papier !== undefined) {
    fields.push('type_papier = ?');
    values.push(data.type_papier);
  }
  if (data.superficie_m2 !== undefined) {
    fields.push('superficie_m2 = ?');
    values.push(data.superficie_m2);
  }
  if (data.etage !== undefined) {
    fields.push('etage = ?');
    values.push(data.etage);
  }
  if (data.configuration !== undefined) {
    fields.push('configuration = ?');
    values.push(data.configuration);
  }
  if (data.annee_construction !== undefined) {
    fields.push('annee_construction = ?');
    values.push(data.annee_construction);
  }
  if (data.distance_plage_m !== undefined) {
    fields.push('distance_plage_m = ?');
    values.push(data.distance_plage_m);
  }
  if (data.proche_plage !== undefined) {
    fields.push('proche_plage = ?');
    values.push(data.proche_plage ? 1 : 0);
  }
  if (data.chauffage_central !== undefined) {
    fields.push('chauffage_central = ?');
    values.push(data.chauffage_central ? 1 : 0);
  }
  if (data.climatisation !== undefined) {
    fields.push('climatisation = ?');
    values.push(data.climatisation ? 1 : 0);
  }
  if (data.balcon !== undefined) {
    fields.push('balcon = ?');
    values.push(data.balcon ? 1 : 0);
  }
  if (data.terrasse !== undefined) {
    fields.push('terrasse = ?');
    values.push(data.terrasse ? 1 : 0);
  }
  if (data.ascenseur !== undefined) {
    fields.push('ascenseur = ?');
    values.push(data.ascenseur ? 1 : 0);
  }
  if (data.vue_mer !== undefined) {
    fields.push('vue_mer = ?');
    values.push(data.vue_mer ? 1 : 0);
  }
  if (data.gaz_ville !== undefined) {
    fields.push('gaz_ville = ?');
    values.push(data.gaz_ville ? 1 : 0);
  }
  if (data.cuisine_equipee !== undefined) {
    fields.push('cuisine_equipee = ?');
    values.push(data.cuisine_equipee ? 1 : 0);
  }
  if (data.place_parking !== undefined) {
    fields.push('place_parking = ?');
    values.push(data.place_parking ? 1 : 0);
  }
  if (data.syndic !== undefined) {
    fields.push('syndic = ?');
    values.push(data.syndic ? 1 : 0);
  }
  if (data.meuble !== undefined) {
    fields.push('meuble = ?');
    values.push(data.meuble ? 1 : 0);
  }
  if (data.independant !== undefined) {
    fields.push('independant = ?');
    values.push(data.independant ? 1 : 0);
  }
  if (data.eau_puits !== undefined) {
    fields.push('eau_puits = ?');
    values.push(data.eau_puits ? 1 : 0);
  }
  if (data.eau_sonede !== undefined) {
    fields.push('eau_sonede = ?');
    values.push(data.eau_sonede ? 1 : 0);
  }
  if (data.electricite_steg !== undefined) {
    fields.push('electricite_steg = ?');
    values.push(data.electricite_steg ? 1 : 0);
  }
  if (data.surface_local_m2 !== undefined) {
    fields.push('surface_local_m2 = ?');
    values.push(data.surface_local_m2);
  }
  if (data.facade_m !== undefined) {
    fields.push('facade_m = ?');
    values.push(data.facade_m);
  }
  if (data.hauteur_plafond_m !== undefined) {
    fields.push('hauteur_plafond_m = ?');
    values.push(data.hauteur_plafond_m);
  }
  if (data.activite_recommandee !== undefined) {
    fields.push('activite_recommandee = ?');
    values.push(data.activite_recommandee);
  }
  if (data.toilette !== undefined) {
    fields.push('toilette = ?');
    values.push(data.toilette ? 1 : 0);
  }
  if (data.reserve_local !== undefined) {
    fields.push('reserve_local = ?');
    values.push(data.reserve_local ? 1 : 0);
  }
  if (data.vitrine !== undefined) {
    fields.push('vitrine = ?');
    values.push(data.vitrine ? 1 : 0);
  }
  if (data.coin_angle !== undefined) {
    fields.push('coin_angle = ?');
    values.push(data.coin_angle ? 1 : 0);
  }
  if (data.electricite_3_phases !== undefined) {
    fields.push('electricite_3_phases = ?');
    values.push(data.electricite_3_phases ? 1 : 0);
  }
  if (data.alarme !== undefined) {
    fields.push('alarme = ?');
    values.push(data.alarme ? 1 : 0);
  }
  if (data.type_terrain !== undefined) {
    fields.push('type_terrain = ?');
    values.push(data.type_terrain);
  }
  if (data.terrain_facade_m !== undefined) {
    fields.push('terrain_facade_m = ?');
    values.push(data.terrain_facade_m);
  }
  if (data.terrain_surface_m2 !== undefined) {
    fields.push('terrain_surface_m2 = ?');
    values.push(data.terrain_surface_m2);
  }
  if (data.terrain_distance_plage_m !== undefined) {
    fields.push('terrain_distance_plage_m = ?');
    values.push(data.terrain_distance_plage_m);
  }
  if (data.terrain_zone !== undefined) {
    fields.push('terrain_zone = ?');
    values.push(data.terrain_zone);
  }
  if (data.terrain_constructible !== undefined) {
    fields.push('terrain_constructible = ?');
    values.push(data.terrain_constructible ? 1 : 0);
  }
  if (data.terrain_angle !== undefined) {
    fields.push('terrain_angle = ?');
    values.push(data.terrain_angle ? 1 : 0);
  }
  if (data.immeuble_details_json !== undefined) {
    fields.push('immeuble_details_json = ?');
    values.push(data.immeuble_details_json);
  }
  if (data.immeuble_appartements_json !== undefined) {
    fields.push('immeuble_appartements_json = ?');
    values.push(data.immeuble_appartements_json);
  }
  if (data.statut !== undefined) {
    fields.push('statut = ?');
    values.push(data.statut);
  }
  if (data.menage_en_cours !== undefined) {
    fields.push('menage_en_cours = ?');
    values.push(data.menage_en_cours);
  }
  if (data.zone_id !== undefined) {
    fields.push('zone_id = ?');
    values.push(data.zone_id);
  }
  if (data.proprietaire_id !== undefined) {
    fields.push('proprietaire_id = ?');
    values.push(data.proprietaire_id);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE biens SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a bien
 */
export async function deleteBien(id: string): Promise<number> {
  const sql = 'DELETE FROM biens WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

// ============================================
// MEDIA OPERATIONS
// ============================================

/**
 * Get all media for a bien
 */
export async function getMediaByBien(bienId: string): Promise<Media[]> {
  const sql = 'SELECT * FROM media WHERE bien_id = ?';
  const rows = await getAll<MediaRow>(sql, [bienId]);
  return rows as unknown as Media[];
}

/**
 * Add media to a bien
 */
export async function addMedia(bienId: string, type: 'image' | 'video', url: string): Promise<number> {
  const id = `m${Date.now()}`;
  const sql = 'INSERT INTO media (id, bien_id, type, url) VALUES (?, ?, ?, ?)';
  const result = await execute(sql, [id, bienId, type, url]);
  return result.affectedRows;
}

/**
 * Delete media
 */
export async function deleteMedia(mediaId: string): Promise<number> {
  const sql = 'DELETE FROM media WHERE id = ?';
  const result = await execute(sql, [mediaId]);
  return result.affectedRows;
}
