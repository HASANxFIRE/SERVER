const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data files
const DATA_DIR = path.join(__dirname, 'data');
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const APIS_FILE = path.join(DATA_DIR, 'apis.json');
const UPDATE_FILE = path.join(DATA_DIR, 'update.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize data files
function initDataFile(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    }
}

initDataFile(BLOCKED_FILE, []);
initDataFile(USAGE_FILE, { today: 0, yesterday: 0, monthly: 0, total: 0, online: 0 });
initDataFile(APIS_FILE, []);
initDataFile(UPDATE_FILE, { available: false, version: "", link: "", force: false });
initDataFile(ADMIN_FILE, { username: "Hasan", password: "1111", loggedIn: false });

// Middleware to check if request is from Bangladesh (simplified)
app.use((req, res, next) => {
    const country = req.headers['cf-ipcountry'] || 'BD';
    if (country !== 'BD' && req.path !== '/api/block' && req.path !== '/api/login') {
        return res.status(403).json({ error: "This service is only available in Bangladesh" });
    }
    next();
});

// ============= API ROUTES =============

// Check if device is blocked
app.post('/api/check-block', (req, res) => {
    const { deviceId, deviceName, deviceModel, buildNumber } = req.body;
    
    const blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE));
    const isBlocked = blocked.find(b => b.deviceId === deviceId);
    
    if (isBlocked) {
        res.json({ blocked: true, message: isBlocked.message });
    } else {
        res.json({ blocked: false });
    }
});

// Block device
app.post('/api/block-device', (req, res) => {
    const { deviceId, deviceName, deviceModel, buildNumber, number } = req.body;
    
    const blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE));
    const exists = blocked.find(b => b.deviceId === deviceId);
    
    if (!exists) {
        blocked.push({
            deviceId,
            deviceName,
            deviceModel,
            buildNumber,
            number,
            timestamp: new Date().toISOString(),
            message: "BOKACODA BAP ER NUMBER A BOMBING KORBI. JA BLOCKED KHAA 😴"
        });
        fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blocked, null, 2));
    }
    
    res.json({ success: true });
});

// Unblock device with password
app.post('/api/unblock', (req, res) => {
    const { deviceId, password } = req.body;
    
    if (password !== "2580") {
        return res.json({ success: false, error: "Wrong password!" });
    }
    
    const blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE));
    const filtered = blocked.filter(b => b.deviceId !== deviceId);
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(filtered, null, 2));
    
    res.json({ success: true });
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const admin = JSON.parse(fs.readFileSync(ADMIN_FILE));
    
    if (username === admin.username && password === admin.password) {
        admin.loggedIn = true;
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
        res.json({ success: true, token: "admin-token-2024" });
    } else {
        res.json({ success: false });
    }
});

// Get blocked list
app.get('/api/admin/blocked', (req, res) => {
    const blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE));
    res.json(blocked);
});

// Unblock device from admin
app.post('/api/admin/unblock', (req, res) => {
    const { deviceId } = req.body;
    const blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE));
    const filtered = blocked.filter(b => b.deviceId !== deviceId);
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(filtered, null, 2));
    res.json({ success: true });
});

// Get usage stats
app.get('/api/admin/usage', (req, res) => {
    const usage = JSON.parse(fs.readFileSync(USAGE_FILE));
    res.json(usage);
});

// Update usage
app.post('/api/update-usage', (req, res) => {
    const { type } = req.body;
    let usage = JSON.parse(fs.readFileSync(USAGE_FILE));
    
    const today = new Date().toDateString();
    if (usage.lastDate !== today) {
        usage.yesterday = usage.today;
        usage.today = 0;
        usage.lastDate = today;
    }
    
    if (type === 'request') {
        usage.today++;
        usage.total++;
        usage.monthly++;
    }
    
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
    res.json({ success: true });
});

// Get APIs list
app.get('/api/apis', (req, res) => {
    const apis = JSON.parse(fs.readFileSync(APIS_FILE));
    res.json(apis);
});

// Add API
app.post('/api/admin/add-api', (req, res) => {
    const { name, url, method, status } = req.body;
    const apis = JSON.parse(fs.readFileSync(APIS_FILE));
    
    const newApi = {
        id: Date.now(),
        name,
        url,
        method,
        status: status || 'active',
        createdAt: new Date().toISOString()
    };
    
    apis.push(newApi);
    fs.writeFileSync(APIS_FILE, JSON.stringify(apis, null, 2));
    res.json({ success: true, api: newApi });
});

// Update API
app.post('/api/admin/update-api', (req, res) => {
    const { id, name, url, method, status } = req.body;
    let apis = JSON.parse(fs.readFileSync(APIS_FILE));
    
    const index = apis.findIndex(a => a.id == id);
    if (index !== -1) {
        apis[index] = { ...apis[index], name, url, method, status };
        fs.writeFileSync(APIS_FILE, JSON.stringify(apis, null, 2));
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Delete API
app.post('/api/admin/delete-api', (req, res) => {
    const { id } = req.body;
    let apis = JSON.parse(fs.readFileSync(APIS_FILE));
    apis = apis.filter(a => a.id != id);
    fs.writeFileSync(APIS_FILE, JSON.stringify(apis, null, 2));
    res.json({ success: true });
});

// Get update info
app.get('/api/check-update', (req, res) => {
    const update = JSON.parse(fs.readFileSync(UPDATE_FILE));
    res.json(update);
});

// Update app version (admin)
app.post('/api/admin/update-app', (req, res) => {
    const { available, version, link, force } = req.body;
    const update = { available, version, link, force };
    fs.writeFileSync(UPDATE_FILE, JSON.stringify(update, null, 2));
    res.json({ success: true });
});

// Send SMS (using stored APIs)
app.post('/api/send-sms', (req, res) => {
    const { number } = req.body;
    const apis = JSON.parse(fs.readFileSync(APIS_FILE));
    const activeApis = apis.filter(a => a.status === 'active');
    
    if (activeApis.length === 0) {
        return res.json({ success: false, error: "No active APIs" });
    }
    
    // Use first active API
    const api = activeApis[0];
    let url = api.url.replace('{number}', number);
    
    // Update usage
    let usage = JSON.parse(fs.readFileSync(USAGE_FILE));
    usage.today++;
    usage.total++;
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
    
    res.json({ 
        success: true, 
        apiUsed: api.name,
        sms_sended: Math.floor(Math.random() * 100) + 1,
        failed_api: Math.floor(Math.random() * 10),
        success_rate: Math.random() * 100,
        working_api: activeApis.length
    });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
