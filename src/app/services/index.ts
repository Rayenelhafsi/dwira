/**
 * Database Services Index
 * Export all CRUD services for easy importing
 */

// Database connection
export { testConnection, closePool } from '../../lib/db';

// Utilisateurs (Users)
export * from './utilisateurs';

// Zones (Locations)
export * from './zones';

// Proprietaires (Owners)
export * from './proprietaires';

// Biens (Properties)
export * from './biens';

// Locataires (Tenants)
export * from './locataires';

// Contrats (Contracts)
export * from './contrats';

// Paiements (Payments)
export * from './paiements';

// Maintenance
export * from './maintenance';

// Notifications
export * from './notifications';

// Unavailable Dates
export * from './unavailableDates';
