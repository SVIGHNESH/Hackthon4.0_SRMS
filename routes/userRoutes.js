const express = require('express');
const multer = require('multer');
const upload = multer({ 
  memoryStorage: true,
  limits: { fileSize: 5 * 1024 * 1024 }
});
const cloudinary = require('cloudinary').v2;
const { loginUser, getDashboardStats, getLeaderboard, getUserComplaints } = require('../controllers/userController');
const router = express.Router();

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
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'user-complaints', resource_type: 'auto' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                uploadStream.end(req.file.buffer);
            });
            imageUrl = result.secure_url;
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