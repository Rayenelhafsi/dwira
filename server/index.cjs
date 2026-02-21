const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });


const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/contracts', express.static(path.join(__dirname, 'contracts')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});


// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'dwira',
  waitForConnections: true,
  connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);
let mediaHasPositionColumn = true;

console.log('🔄 Connecting to database...');
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

// ============================================
// BIENS (PROPERTIES) API
// ============================================

// GET all biens
app.get('/api/biens', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, z.nom as zone_nom, p.nom as proprietaire_nom,
        (
          SELECT GROUP_CONCAT(c.nom SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristiques_list
      FROM biens b 
      LEFT JOIN zones z ON b.zone_id = z.id 
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching biens:', error);
    res.status(500).json({ error: 'Failed to fetch biens' });
  }
});

// GET single bien
app.get('/api/biens/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*,
        (
          SELECT GROUP_CONCAT(c.nom SEPARATOR '||')
          FROM bien_caracteristiques bc
          INNER JOIN caracteristiques c ON c.id = bc.caracteristique_id
          WHERE bc.bien_id = b.id
        ) as caracteristiques_list
      FROM biens b
      WHERE b.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bien not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching bien:', error);
    res.status(500).json({ error: 'Failed to fetch bien' });
  }
});

// POST create bien
app.post('/api/biens', async (req, res) => {
  try {
    const {
      id,
      reference, titre, description, type, nb_chambres, nb_salle_bain,
      prix_nuitee, avance, statut, menage_en_cours, zone_id, proprietaire_id
    } = req.body;

    const bienId = id || ('b' + Date.now());
    const created_at = new Date().toISOString().split('T')[0];
    const updated_at = created_at;

    await pool.query(
      `INSERT INTO biens (id, reference, titre, description, type, nb_chambres, nb_salle_bain, 
        prix_nuitee, avance, statut, menage_en_cours, zone_id, proprietaire_id, 
        date_ajout, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bienId, reference, titre, description || null, type, nb_chambres, nb_salle_bain,
       prix_nuitee, avance || 0, statut || 'disponible', 
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       created_at, created_at, updated_at]
    );

    const [newBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [bienId]);
    res.status(201).json(newBien[0]);
  } catch (error) {
    console.error('Error creating bien:', error);
    res.status(500).json({ error: 'Failed to create bien' });
  }
});


// PUT update bien
app.put('/api/biens/:id', async (req, res) => {
  try {
    const {
      reference, titre, description, type, nb_chambres, nb_salle_bain,
      prix_nuitee, avance, statut, menage_en_cours, zone_id, proprietaire_id
    } = req.body;

    const updated_at = new Date().toISOString().split('T')[0];

    await pool.query(
      `UPDATE biens SET 
        reference = ?, titre = ?, description = ?, type = ?, nb_chambres = ?, 
        nb_salle_bain = ?, prix_nuitee = ?, avance = ?, 
        statut = ?, menage_en_cours = ?, zone_id = ?, proprietaire_id = ?, updated_at = ?
       WHERE id = ?`,
      [reference, titre, description || null, type, nb_chambres, nb_salle_bain,
       prix_nuitee, avance || 0, statut || 'disponible',
       menage_en_cours ? 1 : 0, zone_id || null, proprietaire_id || null,
       updated_at, req.params.id]
    );

    const [updatedBien] = await pool.query('SELECT * FROM biens WHERE id = ?', [req.params.id]);
    res.json(updatedBien[0]);
  } catch (error) {
    console.error('Error updating bien:', error);
    res.status(500).json({ error: 'Failed to update bien' });
  }
});


// DELETE bien
app.delete('/api/biens/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM biens WHERE id = ?', [req.params.id]);
    res.json({ message: 'Bien deleted successfully' });
  } catch (error) {
    console.error('Error deleting bien:', error);
    res.status(500).json({ error: 'Failed to delete bien' });
  }
});

// ============================================
// ZONES API
// ============================================

app.get('/api/zones', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM zones ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching zones:', error);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

app.post('/api/zones', async (req, res) => {
  try {
    const { id, nom, description } = req.body;
    await pool.query('INSERT INTO zones (id, nom, description) VALUES (?, ?, ?)', 
      [id, nom, description || '']);
    const [newZone] = await pool.query('SELECT * FROM zones WHERE id = ?', [id]);
    res.status(201).json(newZone[0]);
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

// ============================================
// PROPRIETAIRES API
// ============================================

app.get('/api/proprietaires', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proprietaires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching proprietaires:', error);
    res.status(500).json({ error: 'Failed to fetch proprietaires' });
  }
});

app.post('/api/proprietaires', async (req, res) => {
  try {
    const { id, nom, telephone, email, cin } = req.body;
    const newId = id || 'p' + Date.now();
    await pool.query('INSERT INTO proprietaires (id, nom, telephone, email, cin) VALUES (?, ?, ?, ?, ?)', 
      [newId, nom, telephone, email, cin]);
    const [newProp] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [newId]);
    res.status(201).json(newProp[0]);
  } catch (error) {
    console.error('Error creating proprietaire:', error);
    res.status(500).json({ error: 'Failed to create proprietaire' });
  }
});

app.put('/api/proprietaires/:id', async (req, res) => {
  try {
    const { nom, telephone, email, cin } = req.body;
    await pool.query('UPDATE proprietaires SET nom = ?, telephone = ?, email = ?, cin = ? WHERE id = ?',
      [nom, telephone, email, cin, req.params.id]);
    const [updated] = await pool.query('SELECT * FROM proprietaires WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating proprietaire:', error);
    res.status(500).json({ error: 'Failed to update proprietaire' });
  }
});

app.delete('/api/proprietaires/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM proprietaires WHERE id = ?', [req.params.id]);
    res.json({ message: 'Proprietaire deleted' });
  } catch (error) {
    console.error('Error deleting proprietaire:', error);
    res.status(500).json({ error: 'Failed to delete proprietaire' });
  }
});

// ============================================
// LOCATAIRES API
// ============================================

app.get('/api/locataires', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM locataires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch locataires' });
  }
});

app.post('/api/locataires', async (req, res) => {
  try {
    const { nom, telephone, email, cin, score_fiabilite } = req.body;
    const id = 'l' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO locataires (id, nom, telephone, email, cin, score_fiabilite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, nom, telephone, email, cin, score_fiabilite || 5, created_at]
    );
    const [newLoc] = await pool.query('SELECT * FROM locataires WHERE id = ?', [id]);
    res.status(201).json(newLoc[0]);
  } catch (error) {
    console.error('Error creating locataire:', error);
    res.status(500).json({ error: 'Failed to create locataire' });
  }
});

// ============================================
// CONTRATS API
// ============================================

app.get('/api/contrats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, b.titre as bien_titre, l.nom as locataire_nom 
      FROM contrats c 
      LEFT JOIN biens b ON c.bien_id = b.id 
      LEFT JOIN locataires l ON c.locataire_id = l.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contrats' });
  }
});

app.post('/api/contrats', async (req, res) => {
  try {
    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut } = req.body;
    const id = 'c' + Date.now();
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, bien_id, locataire_id, date_debut, date_fin, montant_recu || 0, url_pdf || null, statut || 'actif', created_at]
    );
    const [newContrat] = await pool.query('SELECT * FROM contrats WHERE id = ?', [id]);
    res.status(201).json(newContrat[0]);
  } catch (error) {
    console.error('Error creating contrat:', error);
    res.status(500).json({ error: 'Failed to create contrat' });
  }
});

// ============================================
// PAIEMENTS API
// ============================================

app.get('/api/paiements', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.id as contrat_ref 
      FROM paiements p 
      LEFT JOIN contrats c ON p.contrat_id = c.id
      ORDER BY p.date_paiement DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch paiements' });
  }
});

app.post('/api/paiements', async (req, res) => {
  try {
    const { contrat_id, montant, date_paiement, statut, methode } = req.body;
    const id = 'pay' + Date.now();
    await pool.query(
      'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)',
      [id, contrat_id, montant, date_paiement, statut || 'en_attente', methode || 'virement']
    );
    const [newPaiement] = await pool.query('SELECT * FROM paiements WHERE id = ?', [id]);
    res.status(201).json(newPaiement[0]);
  } catch (error) {
    console.error('Error creating paiement:', error);
    res.status(500).json({ error: 'Failed to create paiement' });
  }
});

// ============================================
// MAINTENANCE API
// ============================================

app.get('/api/maintenance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, b.titre as bien_titre 
      FROM maintenance m 
      LEFT JOIN biens b ON m.bien_id = b.id
      ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', async (req, res) => {
  try {
    const { bien_id, description, cout, statut } = req.body;
    const id = 'maint' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO maintenance (id, bien_id, description, cout, statut, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, bien_id, description, cout || 0, statut || 'en_cours', created_at]
    );
    const [newMaint] = await pool.query('SELECT * FROM maintenance WHERE id = ?', [id]);
    res.status(201).json(newMaint[0]);
  } catch (error) {
    console.error('Error creating maintenance:', error);
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

// ============================================
// NOTIFICATIONS API
// ============================================

app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { utilisateur_id, type, message } = req.body;
    const id = 'n' + Date.now();
    const created_at = new Date().toISOString();
    await pool.query(
      'INSERT INTO notifications (id, utilisateur_id, type, message, lu, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      [id, utilisateur_id || '1', type || 'info', message, created_at]
    );
    const [newNotif] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    res.status(201).json(newNotif[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.put('/api/notifications/:id/lu', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET lu = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ============================================
// MEDIA API
// ============================================

app.get('/api/media/:bien_id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM media WHERE bien_id = ? ORDER BY position ASC, id ASC', [req.params.bien_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.put('/api/contrats/:id', async (req, res) => {
  try {
    const { bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut } = req.body;
    const fields = [];
    const values = [];

    if (bien_id !== undefined) { fields.push('bien_id = ?'); values.push(bien_id); }
    if (locataire_id !== undefined) { fields.push('locataire_id = ?'); values.push(locataire_id); }
    if (date_debut !== undefined) { fields.push('date_debut = ?'); values.push(date_debut); }
    if (date_fin !== undefined) { fields.push('date_fin = ?'); values.push(date_fin); }
    if (montant_recu !== undefined) { fields.push('montant_recu = ?'); values.push(montant_recu); }
    if (url_pdf !== undefined) { fields.push('url_pdf = ?'); values.push(url_pdf); }
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await pool.query(`UPDATE contrats SET ${fields.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
    if (!updated.length) return res.status(404).json({ error: 'Contrat not found' });
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating contrat:', error);
    res.status(500).json({ error: 'Failed to update contrat' });
  }
});

const contractStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const contractsDir = path.join(__dirname, 'contracts');
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }
    cb(null, contractsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'contract-' + uniqueSuffix + '.pdf');
  }
});

const contractUpload = multer({
  storage: contractStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    if (isPdfMime || isPdfExt) return cb(null, true);
    cb(new Error('Only PDF files are allowed'));
  }
});

// ============================================
// CARACTERISTIQUES API
// ============================================

app.get('/api/caracteristiques', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM caracteristiques ORDER BY nom ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching caracteristiques:', error);
    res.status(500).json({ error: 'Failed to fetch caracteristiques' });
  }
});

app.post('/api/caracteristiques', async (req, res) => {
  try {
    const { nom } = req.body;
    const id = 'car' + Date.now();
    await pool.query('INSERT INTO caracteristiques (id, nom) VALUES (?, ?)', [id, nom]);
    const [rows] = await pool.query('SELECT * FROM caracteristiques WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating caracteristique:', error);
    res.status(500).json({ error: 'Failed to create caracteristique' });
  }
});

app.post('/api/biens/:id/caracteristiques', async (req, res) => {
  try {
    const { caracteristique_ids } = req.body;
    if (!Array.isArray(caracteristique_ids)) {
      return res.status(400).json({ error: 'caracteristique_ids must be an array' });
    }

    await pool.query('DELETE FROM bien_caracteristiques WHERE bien_id = ?', [req.params.id]);
    for (const caracteristiqueId of caracteristique_ids) {
      await pool.query(
        'INSERT INTO bien_caracteristiques (bien_id, caracteristique_id) VALUES (?, ?)',
        [req.params.id, caracteristiqueId]
      );
    }

    res.json({ message: 'Caracteristiques updated' });
  } catch (error) {
    console.error('Error updating bien caracteristiques:', error);
    res.status(500).json({ error: 'Failed to update bien caracteristiques' });
  }
});

// Upload image endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

app.post('/api/upload-contract', contractUpload.single('contract'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No contract file uploaded' });
    }
    const contractUrl = `http://localhost:${PORT}/contracts/${req.file.filename}`;
    res.json({
      success: true,
      url: contractUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading contract:', error);
    res.status(500).json({ error: 'Failed to upload contract' });
  }
});

app.post('/api/media', async (req, res) => {
  try {
    const { bien_id, type, url, position } = req.body;
    const id = 'm' + Date.now();
    
    // Calculate the next position if not provided (max existing position + 1)
    let mediaPosition = position;
    if (mediaPosition === undefined || mediaPosition === null) {
      const [maxPosResult] = await pool.query(
        'SELECT MAX(position) as maxPos FROM media WHERE bien_id = ?',
        [bien_id]
      );
      mediaPosition = (maxPosResult[0]?.maxPos ?? -1) + 1;
    }
    
    await pool.query('INSERT INTO media (id, bien_id, type, url, position) VALUES (?, ?, ?, ?, ?)',
      [id, bien_id, type || 'image', url, mediaPosition]);
    const [newMedia] = await pool.query('SELECT * FROM media WHERE id = ?', [id]);
    res.status(201).json(newMedia[0]);
  } catch (error) {
    console.error('Error creating media:', error);
    res.status(500).json({ error: 'Failed to create media' });
  }
});


// Update media order
app.put('/api/media/:id/position', async (req, res) => {
  try {
    const { position } = req.body;
    await pool.query('UPDATE media SET position = ? WHERE id = ?', [position, req.params.id]);
    res.json({ message: 'Position updated' });
  } catch (error) {
    console.error('Error updating media position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Bulk update media positions
app.put('/api/media/bulk/positions', async (req, res) => {
  try {
    const { media } = req.body;
    if (!Array.isArray(media)) {
      return res.status(400).json({ error: 'Media array required' });
    }
    
    for (const item of media) {
      await pool.query('UPDATE media SET position = ? WHERE id = ?', [item.position, item.id]);
    }
    
    res.json({ message: 'Positions updated' });
  } catch (error) {
    console.error('Error updating media positions:', error);
    res.status(500).json({ error: 'Failed to update positions' });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM media WHERE id = ?', [req.params.id]);
    res.json({ message: 'Media deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete media' });
  }
});


// ============================================
// UNAVAILABLE DATES API
// ============================================

app.get('/api/unavailable-dates/:bien_id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM unavailable_dates WHERE bien_id = ?', [req.params.bien_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unavailable dates' });
  }
});

app.post('/api/unavailable-dates', async (req, res) => {
  try {
    const { bien_id, start_date, end_date, status } = req.body;
    const id = 'ud' + Date.now();
    await pool.query('INSERT INTO unavailable_dates (id, bien_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
      [id, bien_id, start_date, end_date, status || 'blocked']);
    const [newDate] = await pool.query('SELECT * FROM unavailable_dates WHERE id = ?', [id]);
    res.status(201).json(newDate[0]);
  } catch (error) {
    console.error('Error creating unavailable date:', error);
    res.status(500).json({ error: 'Failed to create unavailable date' });
  }
});

app.delete('/api/unavailable-dates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM unavailable_dates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Unavailable date deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete unavailable date' });
  }
});

// ============================================
// UTILISATEURS API
// ============================================

app.get('/api/utilisateurs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM utilisateurs ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch utilisateurs' });
  }
});

app.post('/api/utilisateurs', async (req, res) => {
  try {
    const { id, nom, email, role, avatar } = req.body;
    const newId = id || 'u' + Date.now();
    const created_at = new Date().toISOString().split('T')[0];
    await pool.query(
      'INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId, nom, email, role || 'user', avatar || null, created_at]
    );
    const [newUser] = await pool.query('SELECT * FROM utilisateurs WHERE id = ?', [newId]);
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating utilisateur:', error);
    res.status(500).json({ error: 'Failed to create utilisateur' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   - GET    /api/biens');
  console.log('   - POST   /api/biens');
  console.log('   - PUT    /api/biens/:id');
  console.log('   - DELETE /api/biens/:id');
  console.log('   - GET    /api/zones');
  console.log('   - GET    /api/proprietaires');
  console.log('   - GET    /api/locataires');
  console.log('   - GET    /api/contrats');
  console.log('   - GET    /api/paiements');
  console.log('   - GET    /api/maintenance');
  console.log('   - GET    /api/notifications');
});
