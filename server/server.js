// ============================================
// Zentry Gaming — Express Backend Server
// ============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'zentry_fallback_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ============================================
// Middleware
// ============================================

// Security headers (relaxed for local dev)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Serve static files (HTML, CSS, JS, images, videos)
app.use(express.static(path.join(__dirname, '..'), {
    extensions: ['html'],
}));

// ============================================
// Auth Middleware
// ============================================

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ============================================
// API Routes
// ============================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'Zentry Gaming API',
        timestamp: new Date().toISOString(),
    });
});

// --- Auth Routes ---

// Register
app.post('/api/auth/register', [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = getDB();
        const { username, email, password } = req.body;

        // Check existing user
        const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }

        const passwordHash = bcrypt.hashSync(password, 12);
        const result = db.prepare(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        ).run(username, email, passwordHash);

        const token = jwt.sign(
            { id: result.lastInsertRowid, username, email, role: 'user' },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: { id: result.lastInsertRowid, username, email, role: 'user' },
        });
    } catch (err) {
        console.error('[Auth] Register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = getDB();
        const { email, password } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user profile
app.get('/api/auth/me', authenticate, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT id, username, email, role, avatar, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// --- Contact Routes ---

// Submit contact form
app.post('/api/contact', [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message must be 10-2000 characters'),
    body('subject').optional().trim().isLength({ max: 200 }),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = getDB();
        const { name, email, subject, message } = req.body;
        const result = db.prepare(
            'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)'
        ).run(name, email, subject || 'General', message);

        res.status(201).json({
            message: 'Message sent successfully!',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        console.error('[Contact] Error:', err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get all contacts (admin only)
app.get('/api/contact', authenticate, requireAdmin, (req, res) => {
    try {
        const db = getDB();
        const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
        res.json({ contacts });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// --- Waitlist / Newsletter ---

app.post('/api/waitlist', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = getDB();
        const { email } = req.body;
        db.prepare('INSERT OR IGNORE INTO waitlist (email) VALUES (?)').run(email);
        res.status(201).json({ message: 'Added to waitlist!' });
    } catch (err) {
        console.error('[Waitlist] Error:', err.message);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
});

// --- Games Routes ---

// Get all games
app.get('/api/games', (req, res) => {
    try {
        const db = getDB();
        const games = db.prepare('SELECT * FROM games ORDER BY featured DESC, created_at DESC').all();
        res.json({ games });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch games' });
    }
});

// Get featured games
app.get('/api/games/featured', (req, res) => {
    try {
        const db = getDB();
        const games = db.prepare('SELECT * FROM games WHERE featured = 1 ORDER BY created_at DESC').all();
        res.json({ games });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch featured games' });
    }
});

// --- Leaderboard Routes ---

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const game = req.query.game;

        let query = 'SELECT * FROM leaderboard';
        const params = [];

        if (game) {
            query += ' WHERE game = ?';
            params.push(game);
        }

        query += ' ORDER BY score DESC LIMIT ?';
        params.push(limit);

        const entries = db.prepare(query).all(...params);
        res.json({ leaderboard: entries });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// Submit score (authenticated)
app.post('/api/leaderboard', authenticate, [
    body('game').trim().notEmpty().withMessage('Game name required'),
    body('score').isInt({ min: 0 }).withMessage('Valid score required'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = getDB();
        const { game, score } = req.body;
        const result = db.prepare(
            'INSERT INTO leaderboard (user_id, username, game, score) VALUES (?, ?, ?, ?)'
        ).run(req.user.id, req.user.username, game, score);

        res.status(201).json({
            message: 'Score submitted!',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        console.error('[Leaderboard] Error:', err.message);
        res.status(500).json({ error: 'Failed to submit score' });
    }
});

// --- Analytics ---

// Track page visit
app.post('/api/analytics/track', (req, res) => {
    try {
        const db = getDB();
        const { page, session_id } = req.body;
        const ip = req.ip;
        const user_agent = req.get('User-Agent');
        const referrer = req.get('Referer') || '';

        db.prepare(
            'INSERT INTO analytics (page, ip, user_agent, referrer, session_id) VALUES (?, ?, ?, ?, ?)'
        ).run(page || '/', ip, user_agent, referrer, session_id || null);

        res.status(201).json({ message: 'Tracked' });
    } catch (err) {
        res.status(500).json({ error: 'Tracking failed' });
    }
});

// Get analytics summary (admin only)
app.get('/api/analytics', authenticate, requireAdmin, (req, res) => {
    try {
        const db = getDB();
        const totalVisits = db.prepare('SELECT COUNT(*) as count FROM analytics').get();
        const topPages = db.prepare(
            'SELECT page, COUNT(*) as visits FROM analytics GROUP BY page ORDER BY visits DESC LIMIT 10'
        ).all();
        const recentVisits = db.prepare(
            'SELECT * FROM analytics ORDER BY created_at DESC LIMIT 20'
        ).all();

        res.json({
            total_visits: totalVisits.count,
            top_pages: topPages,
            recent_visits: recentVisits,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ============================================
// Serve Frontend
// ============================================

// Serve the gaming site at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'gameing.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║    🎮  Zentry Gaming API Server  🎮   ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Local:  http://localhost:${PORT}         ║`);
    console.log('  ║  Status: Running                      ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');

    // Initialize database on startup
    getDB();
    console.log('  [DB] Database initialized successfully');
    console.log('');
});

module.exports = app;
