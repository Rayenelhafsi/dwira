const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runSQLFile() {
  console.log('🔄 Adding position column to media table...\n');
  
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      database: 'dwira',
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL database');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'add-position-column.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 Executing SQL...\n');
    
    // Execute the SQL
    await connection.query(sql);
    
    console.log('✅ Position column added successfully!');
    
    // Verify
    const [columns] = await connection.query('SHOW COLUMNS FROM media');
    console.log('\n📊 Media table columns:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type}`);
    });
    
    await connection.end();
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('💡 Column "position" already exists');
    }
  }
}

runSQLFile();
