import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// Parse host and port from DB_HOST environment variable
const parseHost = (hostEnv: string | undefined): { host: string; port: number } => {
  const defaultResult = { host: 'localhost', port: 3306 };
  
  if (!hostEnv) return defaultResult;
  
  if (hostEnv.includes(':')) {
    const [host, port] = hostEnv.split(':');
    return { host, port: parseInt(port, 10) };
  }
  
  return { host: hostEnv, port: 3306 };
};

const { host, port } = parseHost(process.env.DB_HOST);

// Database configuration
const dbConfig: PoolOptions = {
  host,
  port,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dwira',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create the connection pool
const pool: Pool = mysql.createPool(dbConfig);

// Test the connection
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log(`   Host: ${host}:${port}`);
    connection.release();
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Generic query function
export async function query<T extends RowDataPacket>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

// Generic execute function (for INSERT, UPDATE, DELETE)
export async function execute(sql: string, params?: any[]): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

// Get a single row
export async function getOne<T extends RowDataPacket>(sql: string, params?: any[]): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

// Get multiple rows
export async function getAll<T extends RowDataPacket>(sql: string, params?: any[]): Promise<T[]> {
  return query<T>(sql, params);
}

// Close the pool
export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
