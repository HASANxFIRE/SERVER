const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database setup
const dbPath = path.join(__dirname, 'sms_panelx.db');
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
    // Blocked devices table
    db.run(`CREATE TABLE IF NOT EXISTS blocked_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_name TEXT,
        device_build TEXT,
        device_id TEXT UNIQUE,
        blocked_number TEXT,
        blocked_date TEXT,
        is_blocked INTEGER DEFAULT 1
    )`);
    
    // Admin table
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);
    
    // API endpoints table
    db.run(`CREATE TABLE IF NOT EXISTS api_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_name TEXT,
        api_url TEXT,
        api_key TEXT,
        status INTEGER DEFAULT 1,
        created_date TEXT
    )`);
    
    // App usage table
    db.run(`CREATE TABLE IF NOT EXISTS app_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        visit_date TEXT,
        api_requests INTEGER DEFAULT 0,
        api_success INTEGER DEFAULT 0,
        api_failed INTEGER DEFAULT 0
    )`);
    
    // App version table
    db.run(`CREATE TABLE IF NOT EXISTS app_version (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_name TEXT UNIQUE,
        version_code INTEGER,
        version_name TEXT,
        update_available TEXT,
        update_link TEXT,
        force_update INTEGER DEFAULT 0
    )`);
    
    // Insert default admin (password: admin123)
    db.run(`INSERT OR IGNORE INTO admin_users (username, password, role) VALUES ('admin', '$2b$10$YourHashedPasswordHere', 'super_admin')`);
    
    // Insert default app version
    db.run(`INSERT OR IGNORE INTO app_version (package_name, version_code, version_name, update_available, update_link) VALUES ('com.sms.panelx', 1, '1.0', 'no', '')`);
});

// API Routes

// Check if device is blocked
app.post('/api/check-device', (req, res) => {
    const { device_id, device_name, device_build, number } = req.body;
    
    db.get('SELECT * FROM blocked_devices WHERE device_id = ? AND is_blocked = 1', [device_id], (err, row) => {
        if (err) {
            res.json({ status: 'error', message: 'Database error' });
            return;
        }
        
        if (row) {
            res.json({ 
                status: 'blocked', 
                message: 'BOKACODA BAP ER NUMBER A BOMBING KORBI. JA BLOCKED KHAA 😴',
                device_id: row.device_id
            });
        } else {
            res.json({ status: 'allowed' });
        }
    });
});

// Block device
app.post('/api/block-device', (req, res) => {
    const { device_id, device_name, device_build, blocked_number } = req.body;
    const blocked_date = new Date().toISOString();
    
    db.run(`INSERT OR REPLACE INTO blocked_devices (device_id, device_name, device_build, blocked_number, blocked_date, is_blocked)
            VALUES (?, ?, ?, ?, ?, 1)`, 
            [device_id, device_name, device_build, blocked_number, blocked_date], 
            function(err) {
        if (err) {
            res.json({ status: 'error', message: 'Failed to block device' });
        } else {
            res.json({ status: 'success', message: 'Device blocked' });
        }
    });
});

// Unblock device with password
app.post('/api/unblock-device', (req, res) => {
    const { device_id, password } = req.body;
    
    // Password is "2580"
    if (password === '2580') {
        db.run('UPDATE blocked_devices SET is_blocked = 0 WHERE device_id = ?', [device_id], function(err) {
            if (err) {
                res.json({ status: 'error', message: 'Failed to unblock device' });
            } else {
                res.json({ status: 'success', message: 'Device unblocked successfully' });
            }
        });
    } else {
        res.json({ status: 'error', message: 'Invalid password' });
    }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, row) => {
        if (err || !row) {
            res.json({ status: 'error', message: 'Invalid credentials' });
            return;
        }
        
        // Simple password check (in production use bcrypt)
        if (password === 'admin123') {
            res.json({ status: 'success', token: 'admin-token-123', role: row.role });
        } else {
            res.json({ status: 'error', message: 'Invalid credentials' });
        }
    });
});

// Get blocked devices list
app.get('/api/admin/blocked-devices', (req, res) => {
    db.all('SELECT * FROM blocked_devices WHERE is_blocked = 1 ORDER BY blocked_date DESC', [], (err, rows) => {
        if (err) {
            res.json({ status: 'error', devices: [] });
        } else {
            res.json({ status: 'success', devices: rows });
        }
    });
});

// Get app usage stats
app.get('/api/admin/usage-stats', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    db.get('SELECT COUNT(DISTINCT device_id) as total_users, SUM(api_requests) as total_requests, SUM(api_success) as total_success, SUM(api_failed) as total_failed FROM app_usage', [], (err, total) => {
        db.get('SELECT COUNT(DISTINCT device_id) as today_users, SUM(api_requests) as today_requests FROM app_usage WHERE visit_date = ?', [today], (err, todayStats) => {
            db.get('SELECT COUNT(DISTINCT device_id) as yesterday_users FROM app_usage WHERE visit_date = ?', [yesterday], (err, yesterdayStats) => {
                db.get('SELECT COUNT(DISTINCT device_id) as monthly_users FROM app_usage WHERE visit_date LIKE ?', [currentMonth + '%'], (err, monthlyStats) => {
                    db.get('SELECT COUNT(*) as online_users FROM app_usage WHERE visit_date = ? AND julianday("now") - julianday(visit_date) < 1', [today], (err, online) => {
                        res.json({
                            status: 'success',
                            stats: {
                                total_users: total?.total_users || 0,
                                total_requests: total?.total_requests || 0,
                                total_success: total?.total_success || 0,
                                total_failed: total?.total_failed || 0,
                                today_users: todayStats?.today_users || 0,
                                yesterday_users: yesterdayStats?.yesterday_users || 0,
                                monthly_users: monthlyStats?.monthly_users || 0,
                                online_users: online?.online_users || 0
                            }
                        });
                    });
                });
            });
        });
    });
});

// Record app usage
app.post('/api/record-usage', (req, res) => {
    const { device_id, api_requests, api_success, api_failed } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    db.run(`INSERT INTO app_usage (device_id, visit_date, api_requests, api_success, api_failed)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(device_id, visit_date) DO UPDATE SET
            api_requests = api_requests + ?,
            api_success = api_success + ?,
            api_failed = api_failed + ?`,
            [device_id, today, api_requests, api_success, api_failed, api_requests, api_success, api_failed], 
            (err) => {
        res.json({ status: 'success' });
    });
});

// Get app update status
app.post('/api/check-update', (req, res) => {
    const { package_name, current_version } = req.body;
    
    db.get('SELECT * FROM app_version WHERE package_name = ?', [package_name], (err, row) => {
        if (err || !row) {
            res.json({ status: 'no_update' });
        } else {
            res.json({
                status: 'success',
                update_available: row.update_available,
                update_link: row.update_link,
                version_code: row.version_code,
                force_update: row.force_update
            });
        }
    });
});

// Admin: Add/Edit API endpoint
app.post('/api/admin/add-api', (req, res) => {
    const { api_name, api_url, api_key } = req.body;
    const created_date = new Date().toISOString();
    
    db.run(`INSERT INTO api_endpoints (api_name, api_url, api_key, created_date)
            VALUES (?, ?, ?, ?)`, [api_name, api_url, api_key, created_date], (err) => {
        if (err) {
            res.json({ status: 'error', message: 'Failed to add API' });
        } else {
            res.json({ status: 'success', message: 'API added successfully' });
        }
    });
});

// Get all APIs
app.get('/api/admin/list-apis', (req, res) => {
    db.all('SELECT * FROM api_endpoints ORDER BY created_date DESC', [], (err, rows) => {
        res.json({ status: 'success', apis: rows });
    });
});

// Delete API
app.delete('/api/admin/delete-api/:id', (req, res) => {
    db.run('DELETE FROM api_endpoints WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.json({ status: 'error' });
        } else {
            res.json({ status: 'success' });
        }
    });
});

// Update app version
app.post('/api/admin/update-app', (req, res) => {
    const { package_name, version_code, version_name, update_available, update_link, force_update } = req.body;
    
    db.run(`INSERT OR REPLACE INTO app_version (package_name, version_code, version_name, update_available, update_link, force_update)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [package_name, version_code, version_name, update_available, update_link, force_update], (err) => {
        if (err) {
            res.json({ status: 'error' });
        } else {
            res.json({ status: 'success' });
        }
    });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
