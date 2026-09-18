const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'zentry.db');

let db;
let SQL;

// Wrapper to mimic better-sqlite3 API so server.js stays unchanged
function createStatement(sql) {
    return {
        get(...params) {
            const stmt = db.prepare(sql);
            stmt.bind(params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0]) ? params[0] : params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all(...params) {
            const results = [];
            const stmt = db.prepare(sql);
            stmt.bind(params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0]) ? params[0] : params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        },
        run(...params) {
            // Handle named parameters (objects like @title, @description, etc.)
            if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
                const obj = params[0];
                // Convert { title: 'x' } to { ':title': 'x' } for sql.js named params
                const namedParams = {};
                for (const key of Object.keys(obj)) {
                    namedParams[`:${key}`] = obj[key];
                    namedParams[`@${key}`] = obj[key];
                }
                db.run(sql, namedParams);
            } else {
                db.run(sql, params);
            }
            saveDB();
            return {
                lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0,
                changes: db.getRowsModified(),
            };
        },
    };
}

function saveDB() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error('[DB] Save error:', err.message);
    }
}

async function initDB() {
    SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    initSchema();
    return db;
}

function getDB() {
    if (!db) {
        throw new Error('Database not initialized. Call initDB() first.');
    }
    // Return a wrapper that mimics better-sqlite3 API
    return {
        prepare: (sql) => createStatement(sql),
        exec: (sql) => db.run(sql),
        transaction: (fn) => {
            return (...args) => {
                db.run('BEGIN TRANSACTION');
                try {
                    fn(...args);
                    db.run('COMMIT');
                    saveDB();
                } catch (e) {
                    db.run('ROLLBACK');
                    throw e;
                }
            };
        },
    };
}

function initSchema() {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT NULL
    )`);

    db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT DEFAULT 'General',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'website',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`
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
    )`);

    db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL DEFAULT '/',
      ip TEXT,
      user_agent TEXT,
      referrer TEXT,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    seedData();
    saveDB();
}

function seedData() {
    // Seed admin user
    const adminCheck = db.exec("SELECT id FROM users WHERE role = 'admin'");
    if (!adminCheck.length || !adminCheck[0].values.length) {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@zentry.gg';
        const adminPassword = process.env.ADMIN_PASSWORD || 'Zentry@Admin2024';
        const passwordHash = bcrypt.hashSync(adminPassword, 12);
        db.run(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
            ['ZentryAdmin', adminEmail, passwordHash]
        );
        console.log('[DB] Admin user seeded.');
    }

    // Seed games
    const gamesCheck = db.exec("SELECT COUNT(*) as count FROM games");
    const gamesCount = gamesCheck[0]?.values[0][0] || 0;
    if (gamesCount === 0) {
        const games = [
            { title: 'RADIANT', description: 'An anime and gaming-inspired NFT collection — the IP primed for expansion.', category: 'NFT', video_url: 'Videos/feature-1.mp4', status: 'coming_soon', featured: 1 },
            { title: 'ZIGMA', description: 'A cross-platform metagame app, turning your activities across Web2 and Web3 games into a rewarding experience.', category: 'Metagame', video_url: 'Videos/feature-2.mp4', status: 'coming_soon', featured: 1 },
            { title: 'NEXUS', description: 'A gamified social hub, adding a new dimension of play to social interaction for Web3 communities.', category: 'Social', video_url: 'Videos/feature-3.mp4', status: 'coming_soon', featured: 1 },
            { title: 'AZUL', description: 'A cross-world AI agent — elevating your gameplay to be more fun and productive.', category: 'AI', video_url: 'Videos/feature-4.mp4', status: 'coming_soon', featured: 1 },
        ];
        for (const g of games) {
            db.run(
                "INSERT INTO games (title, description, category, video_url, status, featured) VALUES (?, ?, ?, ?, ?, ?)",
                [g.title, g.description, g.category, g.video_url, g.status, g.featured]
            );
        }
        console.log('[DB] Games seeded.');
    }
}

module.exports = { getDB, initDB };
