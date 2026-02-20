const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runSQLFile() {
  console.log('🔄 Running database setup...\n');
  
  // First connect without database to create it
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL server');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'database.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 Executing database.sql...\n');
    
    // Execute the SQL
    await connection.query(sql);
    
    console.log('✅ Database "dwira" created successfully!');
    console.log('✅ All tables created and sample data inserted!');
    
    // Verify tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`\n📊 Total tables: ${tables.length}`);
    
    // Count records in each table
    const tablesList = [
      'utilisateurs', 'zones', 'proprietaires', 'biens', 
      'media', 'locataires', 'contrats', 'paiements', 
      'maintenance', 'notifications', 'unavailable_dates'
    ];
    
    console.log('\n📝 Records per table:');
    for (const table of tablesList) {
      const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${rows[0].count}`);
    }
    
    await connection.end();
    console.log('\n✅ Database setup completed!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.code === 'ER_DB_CREATE_EXISTS') {
      console.log('\n💡 Database already exists. Trying to insert data...');
    }
  }
}

runSQLFile();
