const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { Keyv } = require('keyv');

let db = null;

// Initialize Keyv instances for different configuration namespaces
const serverConfig = new Keyv('sqlite://./data.sqlite', { namespace: 'serverConfig' });
const globalConfig = new Keyv('sqlite://./data.sqlite', { namespace: 'globalConfig' });

// Error handling for Keyv
serverConfig.on('error', err => console.error('[CONFIG] Server config connection error:', err));
globalConfig.on('error', err => console.error('[CONFIG] Global config connection error:', err));

// Default configuration values
const DEFAULT_CONFIG = {
  prefix: '!',
  language: 'en',
  ttsEnabled: true,
  ttsVolume: 1.0,
  ttsLanguage: 'en-US',
  ultimateBraveryEnabled: true,
  welcomeMessage: null,
  logChannel: null,
  modLogEnabled: false,
  cooldownMultiplier: 1.0
};

/**
 * Get a server configuration value
 * @param {string} guildId - The Discord guild ID
 * @param {string} key - The configuration key
 * @returns {Promise<any>} The configuration value or default
 */
const getServerConfig = async (guildId, key) => {
  if (!guildId) throw new Error('Guild ID is required for server config');
  if (!key) throw new Error('Config key is required');

  try {
    // Get the specific config using the guild ID and key
    const configKey = `${guildId}:${key}`;
    const value = await serverConfig.get(configKey);
    
    // Return the value if it exists, otherwise return the default
    return value !== undefined ? value : DEFAULT_CONFIG[key];
  } catch (error) {
    console.error(`[CONFIG] Error getting server config ${key} for guild ${guildId}:`, error);
    return DEFAULT_CONFIG[key];
  }
};

/**
 * Set a server configuration value
 * @param {string} guildId - The Discord guild ID
 * @param {string} key - The configuration key
 * @param {any} value - The value to set
 * @returns {Promise<boolean>} True if successful
 */
const setServerConfig = async (guildId, key, value) => {
  if (!guildId) throw new Error('Guild ID is required for server config');
  if (!key) throw new Error('Config key is required');

  try {
    const configKey = `${guildId}:${key}`;
    await serverConfig.set(configKey, value);
    return true;
  } catch (error) {
    console.error(`[CONFIG] Error setting server config ${key} for guild ${guildId}:`, error);
    return false;
  }
};

/**
 * Get all configuration for a server
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<object>} The complete server configuration
 */
const getAllServerConfig = async (guildId) => {
  if (!guildId) throw new Error('Guild ID is required for server config');
  
  try {
    const config = {...DEFAULT_CONFIG};
    
    // Iterate through all default keys and try to get their server-specific values
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      config[key] = await getServerConfig(guildId, key);
    }
    
    return config;
  } catch (error) {
    console.error(`[CONFIG] Error getting all server config for guild ${guildId}:`, error);
    return {...DEFAULT_CONFIG};
  }
};

/**
 * Reset a server configuration to defaults
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<boolean>} True if successful
 */
const resetServerConfig = async (guildId) => {
  if (!guildId) throw new Error('Guild ID is required for server config');
  
  try {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const configKey = `${guildId}:${key}`;
      await serverConfig.delete(configKey);
    }
    return true;
  } catch (error) {
    console.error(`[CONFIG] Error resetting server config for guild ${guildId}:`, error);
    return false;
  }
};

/**
 * Get a global configuration value
 * @param {string} key - The configuration key
 * @returns {Promise<any>} The configuration value
 */
const getGlobalConfig = async (key) => {
  if (!key) throw new Error('Config key is required');
  
  try {
    const value = await globalConfig.get(key);
    return value;
  } catch (error) {
    console.error(`[CONFIG] Error getting global config ${key}:`, error);
    return null;
  }
};

/**
 * Set a global configuration value
 * @param {string} key - The configuration key
 * @param {any} value - The value to set
 * @returns {Promise<boolean>} True if successful
 */
const setGlobalConfig = async (key, value) => {
  if (!key) throw new Error('Config key is required');
  
  try {
    await globalConfig.set(key, value);
    return true;
  } catch (error) {
    console.error(`[CONFIG] Error setting global config ${key}:`, error);
    return false;
  }
};

/**
 * A utility function to run a simple database query with proper error handling
 */
const runDbQuery = (query, params = []) => new Promise((resolve, reject) => {
  db.run(query, params, function(err) {
    if (err) {
      console.error(`[DB] Error running query: ${query}`, err);
      return reject(err);
    }
    resolve({ 
      changes: this.changes,
      lastID: this.lastID
    });
  });
});

/**
 * A utility function to get a single row from the database
 */
const getDbRow = (query, params = []) => new Promise((resolve, reject) => {
  db.get(query, params, (err, row) => {
    if (err) {
      console.error(`[DB] Error running query: ${query}`, err);
      return reject(err);
    }
    resolve(row);
  });
});

/**
 * A utility function to get multiple rows from the database
 */
const getDbRows = (query, params = []) => new Promise((resolve, reject) => {
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(`[DB] Error running query: ${query}`, err);
      return reject(err);
    }
    resolve(rows);
  });
});

const initializeDatabase = () => new Promise((resolve, reject) => {
  // If a previous handle exists, close it first to prevent leaks
  if (db) {
    try {
      db.close();
    } catch (_) {
      /* ignore */
    }
  }

  db = new sqlite3.Database('./data.sqlite', (err) => {
    if (err) {
      console.error('[DB] Error opening new database:', err);
      return reject(err);
    }
    db.serialize(() => {
      console.log('[DB] Initializing database...');
      db.run(
        'CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT, product TEXT, status TEXT, position INTEGER, section_order INTEGER)',
        e => { if (e) console.error('[DB] Error creating products table:', e); }
      );
      db.run(
        'ALTER TABLE products ADD COLUMN section_order INTEGER',
        e => { if (e && !e.message.includes('duplicate column name')) console.error('[DB] Error adding section_order column to products:', e); }
      );
      db.run(
        'CREATE TABLE IF NOT EXISTS sections (section TEXT PRIMARY KEY, section_order INTEGER, show_if_empty INTEGER DEFAULT 0)',
        e => { if (e) console.error('[DB] Error creating sections table:', e); }
      );
      db.run(
        'ALTER TABLE sections ADD COLUMN show_if_empty INTEGER DEFAULT 0',
        e => { if (e && !e.message.includes('duplicate column name')) console.error('[DB] Error adding show_if_empty column to sections:', e); }
      );
      
      // Create status history table for statistics
      db.run(
        'CREATE TABLE IF NOT EXISTS status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT, product TEXT, old_status TEXT, new_status TEXT, changed_by TEXT, timestamp INTEGER)',
        e => { if (e) console.error('[DB] Error creating status_history table:', e); }
      );
      
      // Create notification subscriptions tables
      db.run(
        'CREATE TABLE IF NOT EXISTS notifications_all (user_id TEXT PRIMARY KEY)',
        e => { if (e) console.error('[DB] Error creating notifications_all table:', e); }
      );
      
      db.run(
        'CREATE TABLE IF NOT EXISTS notifications_section (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, section TEXT, UNIQUE(user_id, section))',
        e => { if (e) console.error('[DB] Error creating notifications_section table:', e); }
      );
      
      db.run(
        'CREATE TABLE IF NOT EXISTS notifications_product (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, section TEXT, product TEXT, UNIQUE(user_id, section, product))',
        e => { if (e) console.error('[DB] Error creating notifications_product table:', e); }
      );
      
      // Initialize application tables
      db.run(
        'CREATE TABLE IF NOT EXISTS application_settings (key TEXT PRIMARY KEY, value TEXT)',
        e => { if (e) console.error('[DB] Error creating application_settings table:', e); }
      );
      db.run(
        'CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, username TEXT, name TEXT, age TEXT, experience TEXT, why TEXT, availability TEXT, timestamp TEXT, message_id TEXT, status TEXT)',
        e => { if (e) console.error('[DB] Error creating applications table:', e); }
      );
      
      // Add email column to applications table if it doesn't exist
      db.run(
        'ALTER TABLE applications ADD COLUMN email TEXT',
        e => { if (e && !e.message.includes('duplicate column name')) console.error('[DB] Error adding email column to applications:', e); }
      );
      
      // Create guide_links table
      db.run(
        'CREATE TABLE IF NOT EXISTS guide_links (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT, product TEXT, guide_url TEXT, UNIQUE(section, product))',
        e => { if (e) console.error('[DB] Error creating guide_links table:', e); }
      );
      
      const initialSections = ['Counter Strike 2','Apex Legends','Fecurity','Klar','Kernaim','Ring-1','Minecraft','Rust','HWID Spoofer & VPN'];
      initialSections.forEach((sec, index) => {
        db.get('SELECT * FROM sections WHERE section = ?', [sec], (e, row) => {
          if (e) console.error('[DB] Error selecting section:', e);
          if (!row) {
            db.run('INSERT INTO sections (section, section_order) VALUES (?, ?)', [sec, index], err => {
              if (err) console.error('[DB] Error inserting initial section:', err);
            });
          }
        });
      });
      const seedData = {
        'Counter Strike 2': [
          { product: 'Midnight', status: 'up' },
          { product: 'Plague', status: 'up' },
          { product: 'Predator', status: 'up' },
          { product: 'Ovix', status: 'updating' },
          { product: 'Vanity', status: 'updating' },
          { product: 'Nixware', status: 'up' },
          { product: 'Anyx.gg', status: 'updating' },
          { product: 'Neverlose', status: 'up' },
          { product: 'Meme-Sense', status: 'up' }
        ],
        'Apex Legends': [
          { product: 'Lexis', status: 'updating' }
        ],
        Fecurity: [
          { product: 'Valorant', status: 'updating' },
          { product: 'PUBG', status: 'up' },
          { product: 'Bloodhunt', status: 'up' },
          { product: 'Deadside', status: 'updating' },
          { product: 'World War 3', status: 'up' },
          { product: 'Squad', status: 'up' },
          { product: 'Dead by Daylight', status: 'up' },
          { product: 'Insurgency', status: 'up' },
          { product: 'Unturned', status: 'updating' },
          { product: 'BattleBit', status: 'up' },
          { product: 'Battlefield 2042', status: 'up' },
          { product: 'Rogue Company', status: 'up' },
          { product: 'War Thunder', status: 'updating' },
          { product: 'The Finals', status: 'up' },
          { product: 'Counter Strike 2', status: 'up' },
          { product: 'Escape From Tarkov', status: 'up' },
          { product: 'Apex Legends', status: 'up' },
          { product: 'Fortnite', status: 'up' },
          { product: 'Call of Duty, MW, MW2, WZ & WZ2', status: 'up' }
        ],
        Klar: [
          { product: 'DayZ', status: 'updating' },
          { product: 'Marvel Rival', status: 'up' },
          { product: 'Fortnite', status: 'up' },
          { product: 'Apex Legends', status: 'updating' },
          { product: 'Escape From Tarkov: Full', status: 'updating' },
          { product: 'Escape From Tarkov: Lite', status: 'updating' }
        ],
        Kernaim: [
          { product: 'MW3', status: 'up' },
          { product: 'Black Ops 6', status: 'up' },
          { product: 'The Finals', status: 'up' },
          { product: 'DayZ', status: 'up' },
          { product: 'Counter Strike 2', status: 'up' }
        ],
        'Ring-1': [
          { product: 'Apex Legends', status: 'up' },
          { product: 'Ark', status: 'up' },
          { product: 'Battle Bit', status: 'up' },
          { product: 'COD: Black Ops 6', status: 'up' },
          { product: 'COD: Cold War', status: 'up' },
          { product: 'COD: MW', status: 'up' },
          { product: 'COD: MW2', status: 'up' },
          { product: 'COD: MW3', status: 'up' },
          { product: 'COD: Vanguard', status: 'up' },
          { product: 'Dark and Darker', status: 'up' },
          { product: 'DayZ', status: 'up' },
          { product: 'Dead by Daylight', status: 'up' },
          { product: 'Deadlock', status: 'up' },
          { product: 'Escape from Tarkov', status: 'up' },
          { product: 'Hell Let Loose', status: 'up' },
          { product: 'Hunt Showdown', status: 'up' },
          { product: 'Marvel Rivals', status: 'up' },
          { product: 'Overwatch 2', status: 'up' },
          { product: 'PUBG (BASIC)', status: 'up' },
          { product: 'PUBG (FULL)', status: 'up' },
          { product: 'Rainbow Six Siege (BASIC)', status: 'up' },
          { product: 'Rainbow Six Siege (FULL)', status: 'up' },
          { product: 'SCUM', status: 'up' },
          { product: 'XDefiant', status: 'up' },
          { product: 'Arena Breakout Infinite', status: 'updating' }
        ],
        Minecraft: [
          { product: 'Dream', status: 'up' }
        ],
        Rust: [
          { product: 'Disconnect.wtf', status: 'up' },
          { product: 'Ring-1', status: 'down' }
        ],
        'HWID Spoofer & VPN': [
          { product: 'Ethereal HWID Spoofer', status: 'up' }
        ]
      };
      Object.keys(seedData).forEach(sec => {
        const idx = initialSections.indexOf(sec);
        seedData[sec].forEach((entry, pos) => {
          db.get('SELECT * FROM products WHERE section = ? AND product = ?', [sec, entry.product], (e, row) => {
            if (e) console.error('[DB] Error selecting product:', e);
            if (!row) {
              db.run(
                'INSERT INTO products (section, product, status, position, section_order) VALUES (?, ?, ?, ?, ?)',
                [sec, entry.product, entry.status, pos, idx],
                err => { if (err) console.error('[DB] Error inserting product seed:', err); }
              );
            }
          });
        });
      });
      console.log('[DB] Database initialized successfully');
      try {
        fs.chmodSync('./data.sqlite', 0o666);
        console.log('[DB] Database file permissions set to 666');
      } catch (chmodErr) {
        console.error('[DB] Error setting database file permissions:', chmodErr);
      }
      resolve();
    });
  });
});

const reinitializeDatabase = () => new Promise((resolve, reject) => {
  db.serialize(() => {
    console.log('[DB] Reinitializing database...');
    db.run('DROP TABLE IF EXISTS products', (err) => {
      if (err) console.error('[DB] Error dropping products table:', err);
      db.run('DROP TABLE IF EXISTS sections', (err2) => {
        if (err2) console.error('[DB] Error dropping sections table:', err2);
        initializeDatabase()
          .then(() => {
            console.log('[DB] Database reinitialized successfully');
            resolve();
          })
          .catch(reject);
      });
    });
  });
});

const getAllProducts = () => new Promise((resolve, reject) => {
  db.all('SELECT * FROM products ORDER BY section_order ASC, position ASC', (err, rows) => {
    if (err) {
      console.error('[DB] Error getting all products:', err);
      return reject(err);
    }
    resolve(rows);
  });
});

const updateProductStatus = (section, product, status) => new Promise((resolve, reject) => {
  db.run(
    'UPDATE products SET status = ? WHERE section = ? AND product = ?',
    [status, section, product],
    function (err) {
      if (err) {
        console.error('[DB] Error updating product status:', err);
        return reject(err);
      }
      resolve(this.changes);
    }
  );
});

const addProduct = (section, product, status) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM products WHERE section = ? AND product = ?', [section, product], (err, row) => {
    if (err) {
      console.error('[DB] Error checking existing product:', err);
      return reject(err);
    }
    if (row) return reject(new Error('Product already exists'));
    db.get('SELECT MAX(position) as maxPos FROM products WHERE section = ?', [section], (e, r) => {
      if (e) {
        console.error('[DB] Error getting max product position:', e);
        return reject(e);
      }
      const position = r && r.maxPos !== null ? r.maxPos + 1 : 0;
      db.get('SELECT section_order FROM sections WHERE section = ?', [section], (er, secRow) => {
        if (er) {
          console.error('[DB] Error getting section order:', er);
          return reject(er);
        }
        const secOrder = secRow ? secRow.section_order : 0;
        db.run(
          'INSERT INTO products (section, product, status, position, section_order) VALUES (?, ?, ?, ?, ?)',
          [section, product, status, position, secOrder],
          function (error) {
            if (error) {
              console.error('[DB] Error inserting new product:', error);
              return reject(error);
            }
            resolve(this.lastID);
          }
        );
      });
    });
  });
});

const getProduct = (section, product) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM products WHERE section = ? AND product = ?', [section, product], (err, row) => {
    if (err) {
      console.error('[DB] Error getting product:', err);
      return reject(err);
    }
    resolve(row);
  });
});

const getSections = () => {
  return getDbRows(
    'SELECT section, section_order, show_if_empty FROM sections ORDER BY section_order ASC, section ASC'
  ).then(rows => {
    if (!rows || rows.length === 0) return [];
    
    return rows.map(row => row.section);
  });
};

const getProductsBySection = section => new Promise((resolve, reject) => {
  db.all('SELECT product FROM products WHERE section = ? ORDER BY position ASC', [section], (err, rows) => {
    if (err) {
      console.error('[DB] Error getting products by section:', err);
      return reject(err);
    }
    resolve(rows.map(r => r.product));
  });
});

const getProductDetailsBySection = section => new Promise((resolve, reject) => {
  db.all('SELECT product, status FROM products WHERE section = ? ORDER BY position ASC', [section], (err, rows) => {
    if (err) {
      console.error('[DB] Error getting product details by section:', err);
      return reject(err);
    }
    resolve(rows);
  });
});

const updateSectionStatus = (section, status) => new Promise((resolve, reject) => {
  db.run(
    'UPDATE products SET status = ? WHERE section = ?',
    [status, section],
    function (err) {
      if (err) {
        console.error('[DB] Error updating section status:', err);
        return reject(err);
      }
      resolve(this.changes);
    }
  );
});

const addSection = (section, showIfEmpty = false) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM sections WHERE section = ?', [section], (err, row) => {
    if (err) {
      console.error('[DB] Error checking existing section:', err);
      return reject(err);
    }
    if (row) return reject(new Error('Section already exists'));
    db.get('SELECT MAX(section_order) as maxOrder FROM sections', (e, result) => {
      if (e) {
        console.error('[DB] Error getting max section order:', e);
        return reject(e);
      }
      const order = result && result.maxOrder !== null ? result.maxOrder + 1 : 0;
      db.run(
        'INSERT INTO sections (section, section_order, show_if_empty) VALUES (?, ?, ?)',
        [section, order, showIfEmpty ? 1 : 0],
        function (error) {
          if (error) {
            console.error('[DB] Error inserting new section:', error);
            return reject(error);
          }
          resolve(this.lastID);
        }
      );
    });
  });
});

const removeProduct = (section, product) => new Promise((resolve, reject) => {
  db.run('DELETE FROM products WHERE section = ? AND product = ?', [section, product], function (err) {
    if (err) {
      console.error('[DB] Error removing product:', err);
      return reject(err);
    }
    resolve(this.changes);
  });
});

const removeSection = section => new Promise((resolve, reject) => {
  db.run('DELETE FROM products WHERE section = ?', [section], function (err) {
    if (err) {
      console.error('[DB] Error removing products from section:', err);
      return reject(err);
    }
    db.run('DELETE FROM sections WHERE section = ?', [section], function (error) {
      if (error) {
        console.error('[DB] Error removing section:', error);
        return reject(error);
      }
      resolve(this.changes);
    });
  });
});

const updateSectionEmptyFlag = (section, showIfEmpty) => new Promise((resolve, reject) => {
  db.run(
    'UPDATE sections SET show_if_empty = ? WHERE section = ?',
    [showIfEmpty ? 1 : 0, section],
    function (err) {
      if (err) {
        console.error('[DB] Error updating show_if_empty:', err);
        return reject(err);
      }
      resolve(this.changes);
    }
  );
});

// Application settings functions
const setApplicationChannel = (channelId) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['application_channel', channelId],
    function (err) {
      if (err) {
        console.error('[DB] Error setting application channel:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getApplicationChannel = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['application_channel'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting application channel:', err);
        return reject(err);
      }
      resolve(row ? row.value : null);
    }
  );
});

const setStaffRole = (roleId) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['staff_role', roleId],
    function (err) {
      if (err) {
        console.error('[DB] Error setting staff role:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getStaffRole = () => {
  return getDbRow(
    'SELECT value FROM application_settings WHERE key = ?',
    ['staff_role']
  ).then(row => row ? row.value : null);
};

const setAdminRole = (roleId) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['admin_role', roleId],
    function (err) {
      if (err) {
        console.error('[DB] Error setting admin role:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getAdminRole = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['admin_role'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting admin role:', err);
        return reject(err);
      }
      resolve(row ? row.value : null);
    }
  );
});

const setApplicationsStatus = (isOpen) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['applications_open', isOpen ? 'true' : 'false'],
    function (err) {
      if (err) {
        console.error('[DB] Error setting applications status:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getApplicationsStatus = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['applications_open'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting applications status:', err);
        return reject(err);
      }
      resolve(row ? row.value === 'true' : false);
    }
  );
});

// Application management functions
const saveApplication = (application) => new Promise((resolve, reject) => {
  const { userId, username, name, age, experience, why, availability, timestamp, messageId, status } = application;
  
  db.run(
    'INSERT OR REPLACE INTO applications (id, username, name, age, experience, why, availability, timestamp, message_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, username, name, age, experience, why, availability, timestamp, messageId, status],
    function (err) {
      if (err) {
        console.error('[DB] Error saving application:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getApplication = (userId) => new Promise((resolve, reject) => {
  db.get(
    'SELECT * FROM applications WHERE id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting application:', err);
        return reject(err);
      }
      resolve(row);
    }
  );
});

const updateApplicationStatus = (userId, status) => {
  return runDbQuery(
    'UPDATE applications SET status = ? WHERE id = ?',
    [status, userId]
  ).then(result => result.changes);
};

// Update application with email
const updateApplicationEmail = (userId, email) => new Promise((resolve, reject) => {
  db.run(
    'UPDATE applications SET email = ? WHERE id = ?',
    [email, userId],
    function (err) {
      if (err) {
        console.error('[DB] Error updating application email:', err);
        return reject(err);
      }
      if (this.changes === 0) {
        return reject(new Error('Application not found'));
      }
      resolve();
    }
  );
});

// Add transaction wrapper for database operations that should be atomic
const runTransaction = (operations) => new Promise((resolve, reject) => {
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('[DB] Error beginning transaction:', err);
        return reject(err);
      }
      
      Promise.all(operations)
        .then((results) => {
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('[DB] Error committing transaction:', err);
              db.run('ROLLBACK', () => reject(err));
            } else {
              resolve(results);
            }
          });
        })
        .catch((error) => {
          console.error('[DB] Error in transaction operations:', error);
          db.run('ROLLBACK', () => reject(error));
        });
    });
  });
});

// Use transaction for application approval/denial
const processApplicationDecision = (userId, status, assignRole = false) => {
  const operations = [
    updateApplicationStatus(userId, status)
  ];
  
  if (assignRole && status === 'approved') {
    operations.push(getStaffRole());
  }
  
  return runTransaction(operations);
};

// Store application panel information
const setApplicationPanel = (channelId, messageId) => new Promise((resolve, reject) => {
  const operations = [
    new Promise((innerResolve, innerReject) => {
      db.run(
        'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
        ['panel_channel_id', channelId],
        function (err) {
          if (err) {
            console.error('[DB] Error setting panel channel ID:', err);
            return innerReject(err);
          }
          innerResolve();
        }
      );
    }),
    new Promise((innerResolve, innerReject) => {
      db.run(
        'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
        ['panel_message_id', messageId],
        function (err) {
          if (err) {
            console.error('[DB] Error setting panel message ID:', err);
            return innerReject(err);
          }
          innerResolve();
        }
      );
    })
  ];
  
  return runTransaction(operations)
    .then(() => resolve())
    .catch(reject);
});

// Get application panel channel ID
const getApplicationPanelChannel = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['panel_channel_id'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting panel channel ID:', err);
        return reject(err);
      }
      resolve(row ? row.value : null);
    }
  );
});

// Get application panel message ID
const getApplicationPanelMessage = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['panel_message_id'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting panel message ID:', err);
        return reject(err);
      }
      resolve(row ? row.value : null);
    }
  );
});

// Auto-role functions
const setAutoRoleEnabled = (isEnabled) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['auto_role_enabled', isEnabled ? 'true' : 'false'],
    function (err) {
      if (err) {
        console.error('[DB] Error setting auto-role enabled status:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getAutoRoleEnabled = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_role_enabled'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-role enabled status:', err);
        return reject(err);
      }
      resolve(row ? row.value === 'true' : false);
    }
  );
});

const addAutoRole = (roleId, roleName, conditions = null) => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_roles'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-roles:', err);
        return reject(err);
      }
      
      let roles = [];
      if (row && row.value) {
        try {
          roles = JSON.parse(row.value);
        } catch (parseErr) {
          console.error('[DB] Error parsing auto-roles:', parseErr);
        }
      }
      
      // Check if role already exists
      if (roles.some(role => role.id === roleId)) {
        return reject(new Error('Role is already in auto-roles list'));
      }
      
      // Add new role with conditions
      roles.push({ 
        id: roleId, 
        name: roleName,
        conditions: conditions || {} // Store conditions as an object
      });
      
      // Save updated roles
      db.run(
        'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
        ['auto_roles', JSON.stringify(roles)],
        function (saveErr) {
          if (saveErr) {
            console.error('[DB] Error saving auto-roles:', saveErr);
            return reject(saveErr);
          }
          resolve();
        }
      );
    }
  );
});

const updateAutoRoleConditions = (roleId, conditions) => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_roles'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-roles:', err);
        return reject(err);
      }
      
      let roles = [];
      if (row && row.value) {
        try {
          roles = JSON.parse(row.value);
        } catch (parseErr) {
          console.error('[DB] Error parsing auto-roles:', parseErr);
        }
      }
      
      // Find the role to update
      const roleIndex = roles.findIndex(role => role.id === roleId);
      if (roleIndex === -1) {
        return reject(new Error('Role not found in auto-roles list'));
      }
      
      // Update the conditions
      roles[roleIndex].conditions = conditions || {};
      
      // Save updated roles
      db.run(
        'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
        ['auto_roles', JSON.stringify(roles)],
        function (saveErr) {
          if (saveErr) {
            console.error('[DB] Error saving auto-roles:', saveErr);
            return reject(saveErr);
          }
          resolve();
        }
      );
    }
  );
});

const removeAutoRole = (roleId) => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_roles'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-roles:', err);
        return reject(err);
      }
      
      let roles = [];
      if (row && row.value) {
        try {
          roles = JSON.parse(row.value);
        } catch (parseErr) {
          console.error('[DB] Error parsing auto-roles:', parseErr);
        }
      }
      
      // Filter out the role to remove
      const initialLength = roles.length;
      roles = roles.filter(role => role.id !== roleId);
      
      if (roles.length === initialLength) {
        return reject(new Error('Role not found in auto-roles list'));
      }
      
      // Save updated roles
      db.run(
        'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
        ['auto_roles', JSON.stringify(roles)],
        function (saveErr) {
          if (saveErr) {
            console.error('[DB] Error saving auto-roles:', saveErr);
            return reject(saveErr);
          }
          resolve();
        }
      );
    }
  );
});

const getAutoRoles = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_roles'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-roles:', err);
        return reject(err);
      }
      
      if (!row || !row.value) {
        return resolve([]);
      }
      
      try {
        const roles = JSON.parse(row.value);
        resolve(roles);
      } catch (parseErr) {
        console.error('[DB] Error parsing auto-roles:', parseErr);
        resolve([]);
      }
    }
  );
});

const getAutoRole = (roleId) => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['auto_roles'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting auto-roles:', err);
        return reject(err);
      }
      
      if (!row || !row.value) {
        return resolve(null);
      }
      
      try {
        const roles = JSON.parse(row.value);
        const role = roles.find(r => r.id === roleId);
        resolve(role || null);
      } catch (parseErr) {
        console.error('[DB] Error parsing auto-roles:', parseErr);
        resolve(null);
      }
    }
  );
});

// Mod Role 2 functions for secondary permission level
const setModRole2 = (roleId) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)',
    ['mod_role_2', roleId],
    function (err) {
      if (err) {
        console.error('[DB] Error setting mod role 2:', err);
        return reject(err);
      }
      resolve();
    }
  );
});

const getModRole2 = () => new Promise((resolve, reject) => {
  db.get(
    'SELECT value FROM application_settings WHERE key = ?',
    ['mod_role_2'],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting mod role 2:', err);
        return reject(err);
      }
      resolve(row ? row.value : null);
    }
  );
});

// Function to log status changes for statistics
async function logStatusChange(section, product, oldStatus, newStatus, changedBy) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    db.run(
      'INSERT INTO status_history (section, product, old_status, new_status, changed_by, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [section, product, oldStatus, newStatus, changedBy, timestamp],
      function(err) {
        if (err) {
          console.error('Error logging status change:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Function to get status change history
async function getStatusHistory(daysAgo = 30) {
  return new Promise((resolve, reject) => {
    const cutoffTime = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
    
    db.all(
      'SELECT * FROM status_history WHERE timestamp > ? ORDER BY timestamp DESC',
      [cutoffTime],
      (err, rows) => {
        if (err) {
          console.error('Error retrieving status history:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// Function to get status statistics
async function getStatusStatistics(daysAgo = 30) {
  return new Promise((resolve, reject) => {
    const cutoffTime = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
    
    db.all(
      `SELECT 
        section, 
        product,
        COUNT(*) as total_changes,
        SUM(CASE WHEN new_status LIKE '%operational%' OR new_status LIKE '%online%' THEN 1 ELSE 0 END) as operational_count,
        SUM(CASE WHEN new_status LIKE '%issue%' OR new_status LIKE '%degraded%' THEN 1 ELSE 0 END) as degraded_count,
        SUM(CASE WHEN new_status LIKE '%outage%' OR new_status LIKE '%offline%' THEN 1 ELSE 0 END) as outage_count,
        SUM(CASE WHEN new_status LIKE '%maintenance%' THEN 1 ELSE 0 END) as maintenance_count
      FROM status_history 
      WHERE timestamp > ? 
      GROUP BY section, product
      ORDER BY total_changes DESC`,
      [cutoffTime],
      (err, rows) => {
        if (err) {
          console.error('Error retrieving status statistics:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

// Function to get overall system uptime percentage
async function getSystemUptimeStats(daysAgo = 30) {
  return new Promise((resolve, reject) => {
    const cutoffTime = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
    
    db.all(
      `WITH status_periods AS (
        SELECT 
          h1.section, 
          h1.product, 
          h1.new_status as status, 
          h1.timestamp as start_time, 
          COALESCE(MIN(h2.timestamp), ?) as end_time
        FROM status_history h1
        LEFT JOIN status_history h2 ON 
          h1.section = h2.section AND 
          h1.product = h2.product AND 
          h1.timestamp < h2.timestamp
        WHERE h1.timestamp > ?
        GROUP BY h1.section, h1.product, h1.timestamp
      )
      SELECT 
        section,
        product,
        SUM(CASE WHEN status LIKE '%operational%' OR status LIKE '%online%' 
            THEN end_time - start_time ELSE 0 END) as operational_time,
        SUM(CASE WHEN status LIKE '%issue%' OR status LIKE '%degraded%' 
            THEN end_time - start_time ELSE 0 END) as degraded_time,
        SUM(CASE WHEN status LIKE '%outage%' OR status LIKE '%offline%' 
            THEN end_time - start_time ELSE 0 END) as outage_time,
        SUM(CASE WHEN status LIKE '%maintenance%' 
            THEN end_time - start_time ELSE 0 END) as maintenance_time,
        SUM(end_time - start_time) as total_tracked_time
      FROM status_periods
      GROUP BY section, product`,
      [Date.now(), cutoffTime],
      (err, rows) => {
        if (err) {
          console.error('Error retrieving uptime statistics:', err);
          reject(err);
        } else {
          // Calculate percentages
          const results = rows.map(row => {
            const total = row.total_tracked_time || 1; // Avoid division by zero
            return {
              section: row.section,
              product: row.product,
              operational_percentage: (row.operational_time / total) * 100,
              degraded_percentage: (row.degraded_time / total) * 100,
              outage_percentage: (row.outage_time / total) * 100,
              maintenance_percentage: (row.maintenance_time / total) * 100,
              total_tracked_time: row.total_tracked_time
            };
          });
          resolve(results);
        }
      }
    );
  });
}

// Update the updateStatus function to log changes
async function updateStatus(section, product, newStatus, userId) {
  return new Promise((resolve, reject) => {
    // First get the current status
    db.get(
      'SELECT status FROM products WHERE section = ? AND product = ?',
      [section, product],
      async (err, row) => {
        if (err) {
          console.error('Error retrieving current status:', err);
          reject(err);
          return;
        }
        
        const oldStatus = row ? row.status : 'unknown';
        
        // Now update the status
        db.run(
          'UPDATE products SET status = ? WHERE section = ? AND product = ?',
          [newStatus, section, product],
          async function(err) {
            if (err) {
              console.error('Error updating product status:', err);
              reject(err);
            } else {
              // Log the status change for statistics
              try {
                await logStatusChange(section, product, oldStatus, newStatus, userId);
                resolve(this.changes);
              } catch (logErr) {
                console.error('Error logging status change:', logErr);
                // Still resolve the status update even if logging fails
                resolve(this.changes);
              }
            }
          }
        );
      }
    );
  });
}

// Function to find users to notify about a status change
const getUsersToNotify = (section, product) => new Promise((resolve, reject) => {
  db.serialize(() => {
    try {
      const users = new Set();
      
      // Get users subscribed to all notifications
      db.all(
        'SELECT user_id FROM notifications_all',
        [],
        (err, allRows) => {
          if (err) {
            console.error('[DB] Error getting all notification subscribers:', err);
            reject(err);
            return;
          }
          
          // Add these users to the set
          allRows.forEach(row => users.add(row.user_id));
          
          // Get users subscribed to this section
          db.all(
            'SELECT user_id FROM notifications_section WHERE section = ?',
            [section],
            (err, sectionRows) => {
              if (err) {
                console.error('[DB] Error getting section subscribers:', err);
                reject(err);
                return;
              }
              
              // Add these users to the set
              sectionRows.forEach(row => users.add(row.user_id));
              
              // Get users subscribed to this specific product
              db.all(
                'SELECT user_id FROM notifications_product WHERE section = ? AND product = ?',
                [section, product],
                (err, productRows) => {
                  if (err) {
                    console.error('[DB] Error getting product subscribers:', err);
                    reject(err);
                    return;
                  }
                  
                  // Add these users to the set
                  productRows.forEach(row => users.add(row.user_id));
                  
                  // Return array of unique user IDs
                  resolve(Array.from(users));
                }
              );
            }
          );
        }
      );
    } catch (error) {
      console.error('[DB] Error in getUsersToNotify:', error);
      reject(error);
    }
  });
});

// Function to clear all approved or denied applications
const clearApplications = (status) => new Promise((resolve, reject) => {
  const validStatuses = ['approved', 'denied', 'all'];
  
  if (!validStatuses.includes(status)) {
    return reject(new Error('Invalid status. Must be "approved", "denied", or "all"'));
  }
  
  let query = 'DELETE FROM applications';
  let params = [];
  
  if (status !== 'all') {
    query += ' WHERE status = ?';
    params.push(status);
  } else {
    query += ' WHERE status = "approved" OR status = "denied"';
  }
  
  db.run(query, params, function(err) {
    if (err) {
      console.error('[DB] Error clearing applications:', err);
      return reject(err);
    }
    resolve(this.changes);
  });
});

// Function to clear a specific user's application
const clearUserApplication = (userId) => new Promise((resolve, reject) => {
  db.run('DELETE FROM applications WHERE id = ?', [userId], function(err) {
    if (err) {
      console.error('[DB] Error clearing user application:', err);
      return reject(err);
    }
    
    if (this.changes === 0) {
      return reject(new Error('No application found for this user'));
    }
    
    resolve(this.changes);
  });
});

// Function to get applications by status
const getApplicationsByStatus = (status) => new Promise((resolve, reject) => {
  const validStatuses = ['pending', 'approved', 'denied', 'all'];
  
  if (!validStatuses.includes(status)) {
    return reject(new Error('Invalid status. Must be "pending", "approved", "denied", or "all"'));
  }
  
  let query = 'SELECT * FROM applications';
  let params = [];
  
  if (status !== 'all') {
    query += ' WHERE status = ?';
    params.push(status);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('[DB] Error getting applications by status:', err);
      return reject(err);
    }
    resolve(rows);
  });
});

// Function to set a guide link for a product
const setGuideLink = (section, product, guideUrl) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR REPLACE INTO guide_links (section, product, guide_url) VALUES (?, ?, ?)',
    [section, product, guideUrl],
    function(err) {
      if (err) {
        console.error('[DB] Error setting guide link:', err);
        return reject(err);
      }
      resolve(this.changes);
    }
  );
});

// Function to get a guide link for a product
const getGuideLink = (section, product) => new Promise((resolve, reject) => {
  db.get(
    'SELECT guide_url FROM guide_links WHERE section = ? AND product = ?',
    [section, product],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting guide link:', err);
        return reject(err);
      }
      resolve(row ? row.guide_url : null);
    }
  );
});

// Function to get all guide links
const getAllGuideLinks = () => new Promise((resolve, reject) => {
  db.all('SELECT * FROM guide_links', (err, rows) => {
    if (err) {
      console.error('[DB] Error getting all guide links:', err);
      return reject(err);
    }
    resolve(rows);
  });
});

// Function to subscribe a user to all notifications
const subscribeToAll = (userId) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR IGNORE INTO notifications_all (user_id) VALUES (?)',
    [userId],
    function(err) {
      if (err) {
        console.error('[DB] Error subscribing user to all notifications:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to subscribe a user to a section
const subscribeToSection = (userId, section) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR IGNORE INTO notifications_section (user_id, section) VALUES (?, ?)',
    [userId, section],
    function(err) {
      if (err) {
        console.error('[DB] Error subscribing user to section:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to subscribe a user to a product
const subscribeToProduct = (userId, section, product) => new Promise((resolve, reject) => {
  db.run(
    'INSERT OR IGNORE INTO notifications_product (user_id, section, product) VALUES (?, ?, ?)',
    [userId, section, product],
    function(err) {
      if (err) {
        console.error('[DB] Error subscribing user to product:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to unsubscribe a user from all notifications
const unsubscribeFromAll = (userId) => new Promise((resolve, reject) => {
  db.run(
    'DELETE FROM notifications_all WHERE user_id = ?',
    [userId],
    function(err) {
      if (err) {
        console.error('[DB] Error unsubscribing user from all notifications:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to unsubscribe a user from a section
const unsubscribeFromSection = (userId, section) => new Promise((resolve, reject) => {
  db.run(
    'DELETE FROM notifications_section WHERE user_id = ? AND section = ?',
    [userId, section],
    function(err) {
      if (err) {
        console.error('[DB] Error unsubscribing user from section:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to unsubscribe a user from a product
const unsubscribeFromProduct = (userId, section, product) => new Promise((resolve, reject) => {
  db.run(
    'DELETE FROM notifications_product WHERE user_id = ? AND section = ? AND product = ?',
    [userId, section, product],
    function(err) {
      if (err) {
        console.error('[DB] Error unsubscribing user from product:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    }
  );
});

// Function to get all subscriptions for a user
const getSubscriptions = (userId) => new Promise((resolve, reject) => {
  const subscriptions = {
    all: false,
    sections: [],
    products: []
  };
  
  // Check if subscribed to all
  db.get(
    'SELECT 1 FROM notifications_all WHERE user_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('[DB] Error getting all subscription:', err);
        return reject(err);
      }
      
      subscriptions.all = !!row;
      
      // Get section subscriptions
      db.all(
        'SELECT section FROM notifications_section WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[DB] Error getting section subscriptions:', err);
            return reject(err);
          }
          
          subscriptions.sections = rows.map(row => row.section);
          
          // Get product subscriptions
          db.all(
            'SELECT section, product FROM notifications_product WHERE user_id = ?',
            [userId],
            (err, rows) => {
              if (err) {
                console.error('[DB] Error getting product subscriptions:', err);
                return reject(err);
              }
              
              subscriptions.products = rows.map(row => ({
                section: row.section,
                product: row.product
              }));
              
              resolve(subscriptions);
            }
          );
        }
      );
    }
  );
});

module.exports = {
  initializeDatabase,
  reinitializeDatabase,
  
  // Product management
  getAllProducts,
  updateProductStatus,
  addProduct,
  getProduct,
  removeProduct,
  getProductsBySection,
  getProductDetailsBySection,
  
  // Section management
  getSections,
  updateSectionStatus,
  addSection,
  updateSectionEmptyFlag,
  
  // Application configuration
  setApplicationChannel,
  getApplicationChannel,
  setStaffRole,
  getStaffRole,
  setAdminRole,
  getAdminRole,
  setApplicationsStatus,
  getApplicationsStatus,
  
  // Application management
  saveApplication,
  getApplication,
  updateApplicationStatus,
  processApplicationDecision,
  setApplicationPanel,
  getApplicationPanelChannel,
  getApplicationPanelMessage,
  
  // Auto-role functions
  setAutoRoleEnabled,
  getAutoRoleEnabled,
  addAutoRole,
  updateAutoRoleConditions,
  removeAutoRole,
  getAutoRoles,
  getAutoRole,
  
  // Role functions
  setModRole2,
  getModRole2,
  
  // Status updates and history
  updateStatus,
  getStatusHistory,
  getStatusStatistics,
  getSystemUptimeStats,
  
  // Notifications
  getUsersToNotify,
  
  // Guide links
  setGuideLink,
  getGuideLink,
  getAllGuideLinks,

  // Application cleaning
  clearApplications,
  clearUserApplication,
  getApplicationsByStatus,
  updateApplicationEmail,
  
  // Subscriptions
  subscribeToAll,
  subscribeToSection,
  subscribeToProduct,
  unsubscribeFromAll,
  unsubscribeFromSection,
  unsubscribeFromProduct,
  getSubscriptions,
  
  // Common database utility functions
  runDbQuery,
  getDbRow,
  getDbRows,
  
  // New configuration functions
  DEFAULT_CONFIG,
  getServerConfig,
  setServerConfig,
  getAllServerConfig,
  resetServerConfig,
  getGlobalConfig,
  setGlobalConfig
};
