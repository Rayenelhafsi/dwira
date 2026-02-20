const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('🔄 Testing database connection...\n');
  
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      database: 'dwira'
    });

    console.log('✅ Database connected successfully!\n');
    
    // List all tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📋 Tables found:', tables.length);
    
    // Tables to check
    const tableNames = [
      'utilisateurs', 'zones', 'proprietaires', 'biens', 
      'media', 'locataires', 'contrats', 'paiements', 
      'maintenance', 'notifications', 'unavailable_dates'
    ];
    
    console.log('\n📊 Records per table:\n');
    
    for (const table of tableNames) {
      try {
        const [rows] = await connection.query(`SELECT * FROM ${table}`);
        console.log(`   ✅ ${table}: ${rows.length} records`);
      } catch (err) {
        console.log(`   ❌ ${table}: Error - ${err.message}`);
      }
    }
    
    // Show sample data from biens
    console.log('\n📝 Sample data from "biens" table:');
    const [biens] = await connection.query('SELECT id, reference, titre, type, prix_nuitee, statut FROM biens LIMIT 5');
    console.table(biens);
    
    // Show sample data from proprietaires
    console.log('\n📝 Sample data from "proprietaires" table:');
    const [proprietaires] = await connection.query('SELECT id, nom, email, telephone FROM proprietaires');
    console.table(proprietaires);
    
    await connection.end();
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Tip: Check your username and password in .env file');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('\n💡 Tip: Database "dwira" does not exist. Run database.sql first!');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Tip: MySQL server is not running. Start MySQL first!');
    }
  }
}

testConnection();
