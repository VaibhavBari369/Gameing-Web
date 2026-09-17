const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'zentry.db');

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT NULL
    );

    -- Contacts table
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT DEFAULT 'General',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Waitlist / Newsletter table
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'website',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Games table
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Action',
      image_url TEXT,
      video_url TEXT,
      status TEXT DEFAULT 'coming_soon',
      featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Leaderboard table
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Analytics / Visitor tracking
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL DEFAULT '/',
      ip TEXT,
      user_agent TEXT,
      referrer TEXT,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedData();
}

function seedData() {
  // Seed admin user
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existingAdmin) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@zentry.gg';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Zentry@Admin2024';
    const passwordHash = bcrypt.hashSync(adminPassword, 12);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).run('ZentryAdmin', adminEmail, passwordHash);
    console.log('[DB] Admin user seeded.');
  }

  // Seed games
  const existingGames = db.prepare('SELECT COUNT(*) as count FROM games').get();
  if (existingGames.count === 0) {
    const games = [
      {
        title: 'RADIANT',
        description: 'An anime and gaming-inspired NFT collection — the IP primed for expansion.',
        category: 'NFT',
        video_url: 'Videos/feature-1.mp4',
        status: 'coming_soon',
        featured: 1
      },
      {
        title: 'ZIGMA',
        description: 'A cross-platform metagame app, turning your activities across Web2 and Web3 games into a rewarding experience.',
        category: 'Metagame',
        video_url: 'Videos/feature-2.mp4',
        status: 'coming_soon',
        featured: 1
      },
      {
        title: 'NEXUS',
        description: 'A gamified social hub, adding a new dimension of play to social interaction for Web3 communities.',
        category: 'Social',
        video_url: 'Videos/feature-3.mp4',
        status: 'coming_soon',
        featured: 1
      },
      {
        title: 'AZUL',
        description: 'A cross-world AI agent — elevating your gameplay to be more fun and productive.',
        category: 'AI',
        video_url: 'Videos/feature-4.mp4',
        status: 'coming_soon',
        featured: 1
      }
    ];

    const insert = db.prepare(`
      INSERT INTO games (title, description, category, video_url, status, featured)
      VALUES (@title, @description, @category, @video_url, @status, @featured)
    `);
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(row);
    });
    insertMany(games);
    console.log('[DB] Games seeded.');
  }
}

module.exports = { getDB };
