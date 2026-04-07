const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sms_panelx';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Schemas
const blockedDeviceSchema = new mongoose.Schema({
    deviceName: String,
    deviceModel: String,
    deviceBrand: String,
    androidVersion: String,
    buildNumber: String,
    deviceId: String,
    phoneNumber: String,
    blockedDate: { type: Date, default: Date.now },
    isBlocked: { type: Boolean, default: true },
    unblockCode: String
});

const appUsageSchema = new mongoose.Schema({
    date: { type: String, required: true },
    totalUsers: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    apiRequests: { type: Number, default: 0 },
    apiSuccess: { type: Number, default: 0 },
    apiFailed: { type: Number, default: 0 },
    totalSmsSent: { type: Number, default: 0 }
});

const apiConfigSchema = new mongoose.Schema({
    apiName: String,
    apiUrl: String,
    apiKey: String,
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now }
});

const appUpdateSchema = new mongoose.Schema({
    versionCode: String,
    versionName: String,
    updateAvailable: { type: Boolean, default: false },
    updateUrl: String,
    forceUpdate: { type: Boolean, default: false },
    releaseNotes: String,
    lastChecked: { type: Date, default: Date.now }
});

const onlineUserSchema = new mongoose.Schema({
    deviceId: String,
    deviceName: String,
    lastSeen: { type: Date, default: Date.now },
    ipAddress: String
});

const BlockedDevice = mongoose.model('BlockedDevice', blockedDeviceSchema);
const AppUsage = mongoose.model('AppUsage', appUsageSchema);
const ApiConfig = mongoose.model('ApiConfig', apiConfigSchema);
const AppUpdate = mongoose.model('AppUpdate', appUpdateSchema);
const OnlineUser = mongoose.model('OnlineUser', onlineUserSchema);

// API Routes

// Check if device is blocked
app.post('/api/check-device', async (req, res) => {
    try {
        const { deviceId, phoneNumber, deviceName, deviceModel, deviceBrand, androidVersion, buildNumber } = req.body;
        
        let blockedDevice = await BlockedDevice.findOne({ deviceId });
        
        if (!blockedDevice && phoneNumber === '01744298642') {
            // Block this device
            blockedDevice = new BlockedDevice({
                deviceId,
                deviceName,
                deviceModel,
                deviceBrand,
                androidVersion,
                buildNumber,
                phoneNumber,
                isBlocked: true
            });
            await blockedDevice.save();
            
            // Update usage stats
            await updateAppUsage('blocked');
            
            return res.json({ 
                isBlocked: true, 
                message: "BOKACODA BAP ER NUMBER A BOMBING KORBI. JA BLOCKED KHAA 😴",
                requiresUnblock: true
            });
        }
        
        if (blockedDevice && blockedDevice.isBlocked) {
            return res.json({ 
                isBlocked: true, 
                message: "BOKACODA BAP ER NUMBER A BOMBING KORBI. JA BLOCKED KHAA 😴",
                requiresUnblock: true
            });
        }
        
        // Update online status
        await OnlineUser.findOneAndUpdate(
            { deviceId },
            { deviceName, lastSeen: new Date(), ipAddress: req.ip },
            { upsert: true }
        );
        
        res.json({ isBlocked: false });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Unblock device with password
app.post('/api/unblock-device', async (req, res) => {
    try {
        const { deviceId, password } = req.body;
        
        // Secret password - only YOU know this
        if (password === '2580') {
            await BlockedDevice.findOneAndUpdate(
                { deviceId },
                { isBlocked: false, unblockCode: password }
            );
            res.json({ success: true, message: "Device unblocked successfully!" });
        } else {
            res.json({ success: false, message: "Invalid password!" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Panel - Get all blocked devices
app.get('/api/admin/blocked-devices', async (req, res) => {
    try {
        const devices = await BlockedDevice.find({ isBlocked: true }).sort({ blockedDate: -1 });
        res.json(devices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Panel - Unblock device
app.post('/api/admin/unblock-device', async (req, res) => {
    try {
        const { deviceId } = req.body;
        await BlockedDevice.findOneAndUpdate({ deviceId }, { isBlocked: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get app usage statistics
app.get('/api/admin/usage-stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        const todayStats = await AppUsage.findOne({ date: today });
        const yesterdayStats = await AppUsage.findOne({ date: yesterday });
        const monthlyStats = await AppUsage.find({ date: { $regex: currentMonth } });
        
        const totalUsers = await BlockedDevice.countDocuments();
        const onlineUsers = await OnlineUser.countDocuments({ lastSeen: { $gt: new Date(Date.now() - 5 * 60000) } });
        
        const totalApiRequests = monthlyStats.reduce((sum, stat) => sum + stat.apiRequests, 0);
        const totalApiSuccess = monthlyStats.reduce((sum, stat) => sum + stat.apiSuccess, 0);
        const totalApiFailed = monthlyStats.reduce((sum, stat) => sum + stat.apiFailed, 0);
        const totalSmsSent = monthlyStats.reduce((sum, stat) => sum + stat.totalSmsSent, 0);
        
        res.json({
            today: {
                users: todayStats?.totalUsers || 0,
                activeUsers: todayStats?.activeUsers || 0,
                apiRequests: todayStats?.apiRequests || 0,
                apiSuccess: todayStats?.apiSuccess || 0,
                apiFailed: todayStats?.apiFailed || 0,
                smsSent: todayStats?.totalSmsSent || 0
            },
            yesterday: {
                users: yesterdayStats?.totalUsers || 0,
                apiRequests: yesterdayStats?.apiRequests || 0
            },
            monthly: {
                totalUsers,
                onlineUsers,
                totalApiRequests,
                totalApiSuccess,
                totalApiFailed,
                totalSmsSent
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Management
app.get('/api/admin/apis', async (req, res) => {
    try {
        const apis = await ApiConfig.find().sort({ priority: 1 });
        res.json(apis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/add-api', async (req, res) => {
    try {
        const api = new ApiConfig(req.body);
        await api.save();
        res.json({ success: true, api });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/update-api/:id', async (req, res) => {
    try {
        const api = await ApiConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, api });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/delete-api/:id', async (req, res) => {
    try {
        await ApiConfig.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check app update
app.post('/api/check-update', async (req, res) => {
    try {
        const { packageName, currentVersion } = req.body;
        const update = await AppUpdate.findOne();
        
        if (update && update.updateAvailable) {
            res.json({
                hasUpdate: true,
                versionCode: update.versionCode,
                versionName: update.versionName,
                updateUrl: update.updateUrl,
                forceUpdate: update.forceUpdate,
                releaseNotes: update.releaseNotes
            });
        } else {
            res.json({ hasUpdate: false });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update app settings (admin)
app.post('/api/admin/update-app', async (req, res) => {
    try {
        const update = await AppUpdate.findOneAndUpdate({}, req.body, { upsert: true, new: true });
        res.json({ success: true, update });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Track API usage
app.post('/api/track-usage', async (req, res) => {
    try {
        const { deviceId, success, smsCount } = req.body;
        await updateAppUsage('api', success, smsCount);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to update app usage
async function updateAppUsage(type, success = null, smsCount = 0) {
    const today = new Date().toISOString().split('T')[0];
    let usage = await AppUsage.findOne({ date: today });
    
    if (!usage) {
        usage = new AppUsage({ date: today });
    }
    
    if (type === 'blocked') {
        usage.totalUsers += 1;
    } else if (type === 'api') {
        usage.apiRequests += 1;
        if (success) {
            usage.apiSuccess += 1;
            usage.totalSmsSent += smsCount;
        } else {
            usage.apiFailed += 1;
        }
    }
    
    await usage.save();
}

// Admin Panel HTML
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// Initialize default data
async function initDatabase() {
    const apiCount = await ApiConfig.countDocuments();
    if (apiCount === 0) {
        const defaultApi = new ApiConfig({
            apiName: "Default SMS API",
            apiUrl: "https://smsxpanel.vercel.app/",
            isActive: true,
            priority: 1
        });
        await defaultApi.save();
    }
    
    const updateCount = await AppUpdate.countDocuments();
    if (updateCount === 0) {
        const defaultUpdate = new AppUpdate({
            versionCode: "1",
            versionName: "1.0.0",
            updateAvailable: false,
            forceUpdate: false
        });
        await defaultUpdate.save();
    }
}

initDatabase();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
