import { getOne, getAll, execute } from '../../lib/db';
import { Maintenance } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface MaintenanceRow extends RowDataPacket, Maintenance {}

export interface CreateMaintenanceInput {
  id: string;
  bien_id: string;
  description: string;
  cout: number;
  statut?: 'en_cours' | 'termine' | 'annule';
  created_at: string;
}

export interface UpdateMaintenanceInput {
  description?: string;
  cout?: number;
  statut?: 'en_cours' | 'termine' | 'annule';
}

/**
 * Get all maintenance requests
 */
export async function getAllMaintenances(): Promise<Maintenance[]> {
  const sql = 'SELECT * FROM maintenance ORDER BY created_at DESC';
  const rows = await getAll<MaintenanceRow>(sql);
  return rows as unknown as Maintenance[];
}

/**
 * Get maintenance by ID
 */
export async function getMaintenanceById(id: string): Promise<Maintenance | undefined> {
  const sql = 'SELECT * FROM maintenance WHERE id = ?';
  const row = await getOne<MaintenanceRow>(sql, [id]);
  return row as unknown as Maintenance | undefined;
}

/**
 * Get maintenance requests by bien
 */
export async function getMaintenancesByBien(bienId: string): Promise<Maintenance[]> {
  const sql = 'SELECT * FROM maintenance WHERE bien_id = ? ORDER BY created_at DESC';
  const rows = await getAll<MaintenanceRow>(sql, [bienId]);
  return rows as unknown as Maintenance[];
}

/**
 * Get maintenance requests by statut
 */
export async function getMaintenancesByStatut(statut: 'en_cours' | 'termine' | 'annule'): Promise<Maintenance[]> {
  const sql = 'SELECT * FROM maintenance WHERE statut = ? ORDER BY created_at DESC';
  const rows = await getAll<MaintenanceRow>(sql, [statut]);
  return rows as unknown as Maintenance[];
}

/**
 * Get active maintenance requests
 */
export async function getActiveMaintenances(): Promise<Maintenance[]> {
  const sql = "SELECT * FROM maintenance WHERE statut = 'en_cours' ORDER BY created_at DESC";
  const rows = await getAll<MaintenanceRow>(sql);
  return rows as unknown as Maintenance[];
}

/**
 * Create a new maintenance request
 */
export async function createMaintenance(data: CreateMaintenanceInput): Promise<number> {
  const sql = 'INSERT INTO maintenance (id, bien_id, description, cout, statut, created_at) VALUES (?, ?, ?, ?, ?, ?)';
  const result = await execute(sql, [
    data.id,
    data.bien_id,
    data.description,
    data.cout,
    data.statut || 'en_cours',
    data.created_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing maintenance request
 */
export async function updateMaintenance(id: string, data: UpdateMaintenanceInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | undefined)[] = [];

  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.cout !== undefined) {
    fields.push('cout = ?');
    values.push(data.cout);
  }
  if (data.statut !== undefined) {
    fields.push('statut = ?');
    values.push(data.statut);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE maintenance SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a maintenance request
 */
export async function deleteMaintenance(id: string): Promise<number> {
  const sql = 'DELETE FROM maintenance WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Mark maintenance as completed
 */
export async function completeMaintenance(id: string): Promise<number> {
  const sql = "UPDATE maintenance SET statut = 'termine' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Cancel a maintenance request
 */
export async function cancelMaintenance(id: string): Promise<number> {
  const sql = "UPDATE maintenance SET statut = 'annule' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
