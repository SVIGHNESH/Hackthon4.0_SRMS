const express = require('express');
const multer = require('multer');
const upload = multer({ 
  memoryStorage: true,
  limits: { fileSize: 5 * 1024 * 1024 }
});
const { loginUser, getDashboardStats, getLeaderboard, getUserComplaints } = require('../controllers/userController');
const router = express.Router();

function parseDataUriImage(imageUrl) {
    if (!imageUrl) return null;
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1] || 'image/jpeg', base64Data: match[2] };
}

function bufferToDataUri(file) {
    const mimeType = file.mimetype || 'image/jpeg';
    const base64Data = file.buffer.toString('base64');
    return `data:${mimeType};base64,${base64Data}`;
}

router.post('/login', loginUser);
router.get('/dashboard', getDashboardStats);
router.get('/leaderboard', getLeaderboard);
router.get('/my-complaints', getUserComplaints);
router.get('/categories', require('../controllers/adminController').getComplaintCategories);

router.post('/complaint', async (req, res) => {
    try {
        const { title, location, latitude, longitude, description, user_imei, municipality_id, municipalityName, type } = req.body;
        
        const complaint = await require('../models/Complaint').create({
            title,
            location,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            description,
            user_imei,
            municipality_id,
            municipalityName,
            type,
            status: "Pending"
        });
        
        if (municipality_id) {
            await require('../models/Municipal').findByIdAndUpdate(municipality_id, { $inc: { pending: 1 } });
        }
        
        res.json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/complaint/with-image', upload.single('image'), async (req, res) => {
    try {
        const { title, location, latitude, longitude, description, user_imei, municipality_id, municipalityName, type } = req.body;
        
        let imageUrl = '';
        if (req.file && req.file.buffer) {
            imageUrl = bufferToDataUri(req.file);
        } else if (req.body.imageUrl && req.body.imageUrl.startsWith('data:')) {
            const parsed = parseDataUriImage(req.body.imageUrl);
            if (!parsed) {
                return res.status(400).json({ success: false, message: 'Invalid base64 image format' });
            }
            imageUrl = req.body.imageUrl;
        }
        
        const complaint = await require('../models/Complaint').create({
            title,
            location,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            description,
            imageUrl: imageUrl || req.body.imageUrl,
            user_imei,
            municipality_id,
            municipalityName,
            type,
            status: "Pending"
        });
        
        if (municipality_id) {
            await require('../models/Municipal').findByIdAndUpdate(municipality_id, { $inc: { pending: 1 } });
        }
        
        const user = await require('../models/User').findOne({ imei_id: user_imei });
        if (user) {
            user.complaints.push(complaint._id);
            await user.save();
        }
        
        res.json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
