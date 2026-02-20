import { getOne, getAll, execute } from '../../lib/db';
import { RowDataPacket } from 'mysql2/promise';

interface UnavailableDateRow extends RowDataPacket {
  id: string;
  bien_id: string;
  start_date: string;
  end_date: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  payment_deadline?: string;
}

export interface CreateUnavailableDateInput {
  id: string;
  bien_id: string;
  start_date: string;
  end_date: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  payment_deadline?: string;
}

export interface UpdateUnavailableDateInput {
  start_date?: string;
  end_date?: string;
  status?: 'blocked' | 'pending' | 'booked';
  color?: string;
  payment_deadline?: string;
}

/**
 * Get all unavailable dates
 */
export async function getAllUnavailableDates(): Promise<UnavailableDateRow[]> {
  const sql = 'SELECT * FROM unavailable_dates ORDER BY start_date ASC';
  return getAll<UnavailableDateRow>(sql);
}

/**
 * Get unavailable date by ID
 */
export async function getUnavailableDateById(id: string): Promise<UnavailableDateRow | undefined> {
  const sql = 'SELECT * FROM unavailable_dates WHERE id = ?';
  return getOne<UnavailableDateRow>(sql, [id]);
}

/**
 * Get unavailable dates by bien
 */
export async function getUnavailableDatesByBien(bienId: string): Promise<UnavailableDateRow[]> {
  const sql = 'SELECT * FROM unavailable_dates WHERE bien_id = ? ORDER BY start_date ASC';
  return getAll<UnavailableDateRow>(sql, [bienId]);
}

/**
 * Get unavailable dates by status
 */
export async function getUnavailableDatesByStatus(status: 'blocked' | 'pending' | 'booked'): Promise<UnavailableDateRow[]> {
  const sql = 'SELECT * FROM unavailable_dates WHERE status = ? ORDER BY start_date ASC';
  return getAll<UnavailableDateRow>(sql, [status]);
}

/**
 * Check if dates are unavailable for a bien
 */
export async function checkDatesUnavailable(bienId: string, startDate: string, endDate: string): Promise<UnavailableDateRow[]> {
  const sql = `
    SELECT * FROM unavailable_dates 
    WHERE bien_id = ? 
    AND status != 'blocked'
    AND (
      (start_date <= ? AND end_date >= ?)
      OR (start_date <= ? AND end_date >= ?)
      OR (start_date >= ? AND end_date <= ?)
    )
  `;
  return getAll<UnavailableDateRow>(sql, [bienId, endDate, startDate, endDate, startDate, startDate, endDate]);
}

/**
 * Create a new unavailable date
 */
export async function createUnavailableDate(data: CreateUnavailableDateInput): Promise<number> {
  const sql = `
    INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status, color, payment_deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await execute(sql, [
    data.id,
    data.bien_id,
    data.start_date,
    data.end_date,
    data.status,
    data.color || null,
    data.payment_deadline || null
  ]);
  return result.affectedRows;
}

/**
 * Update an existing unavailable date
 */
export async function updateUnavailableDate(id: string, data: UpdateUnavailableDateInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | undefined)[] = [];

  if (data.start_date !== undefined) {
    fields.push('start_date = ?');
    values.push(data.start_date);
  }
  if (data.end_date !== undefined) {
    fields.push('end_date = ?');
    values.push(data.end_date);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    values.push(data.color);
  }
  if (data.payment_deadline !== undefined) {
    fields.push('payment_deadline = ?');
    values.push(data.payment_deadline);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE unavailable_dates SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete an unavailable date
 */
export async function deleteUnavailableDate(id: string): Promise<number> {
  const sql = 'DELETE FROM unavailable_dates WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Delete all unavailable dates for a bien
 */
export async function deleteUnavailableDatesByBien(bienId: string): Promise<number> {
  const sql = 'DELETE FROM unavailable_dates WHERE bien_id = ?';
  const result = await execute(sql, [bienId]);
  return result.affectedRows;
}
