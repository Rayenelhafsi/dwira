import mysql from 'mysql2/promise';

async function testDatabaseConnection() {
  console.log('🔄 Testing database connection...');
  
  try {
    // Create connection
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'root',
      database: 'dwira'
    });

    console.log('✅ Database connected successfully!');
    
    // Test queries
    console.log('\n📊 Testing queries...\n');
    
    // Get all tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tables in database:', tables);
    
    // Test each table
    const tablesList = ['utilisateurs', 'zones', 'proprietaires', 'biens', 'media', 'locataires', 'contrats', 'paiements', 'maintenance', 'notifications', 'unavailable_dates'];
    
    for (const table of tablesList) {
      try {
        const [rows] = await connection.query(`SELECT * FROM ${table} LIMIT 5`);
        console.log(`✅ ${table}: ${(rows as any[]).length} records`);
      } catch (err) {
        console.log(`❌ ${table}: Table not found or error - ${err}`);
      }
    }
    
    await connection.end();
    console.log('\n✅ All tests passed! Database is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', error);
  }
}

testDatabaseConnection();
