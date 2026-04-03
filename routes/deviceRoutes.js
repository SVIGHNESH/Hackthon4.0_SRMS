const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const User = require('../models/User');
const Municipal = require('../models/Municipal');

router.post('/device/register', async (req, res) => {
    try {
        const { deviceId, createdAt } = req.body;
        
        if (!deviceId) {
            return res.status(400).json({ success: false, message: 'deviceId is required' });
        }

        let user = await User.findOne({ imei_id: deviceId });
        
        if (user) {
            return res.json({ 
                success: true, 
                message: 'Device already registered',
                userId: user._id.toString()
            });
        }

        user = await User.create({
            imei_id: deviceId,
            rewardPoints: 0,
            complaints: [],
            createdAt: createdAt || new Date()
        });

        res.status(201).json({ 
            success: true, 
            message: 'Device registered successfully',
            userId: user._id.toString()
        });
    } catch (error) {
        if (error.code === 11000) {
            const user = await User.findOne({ imei_id: req.body.deviceId });
            if (!user) {
                return res.status(500).json({ success: false, message: 'User not found after duplicate error' });
            }
            return res.json({ 
                success: true, 
                message: 'Device already registered',
                userId: user._id.toString()
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/device/login', async (req, res) => {
    try {
        const { deviceId } = req.body;
        
        if (!deviceId) {
            return res.status(400).json({ success: false, message: 'deviceId is required' });
        }

        const user = await User.findOne({ imei_id: deviceId });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Device not registered' });
        }

        res.json({ 
            success: true, 
            message: 'Login successful',
            userId: user._id.toString()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/municipality/stats/:name', async (req, res) => {
    try {
        const { name } = req.params;
        
        const municipality = await Municipal.findOne({ district_name: name });
        
        if (!municipality) {
            return res.json({
                success: true,
                municipalityName: name,
                pending: 0,
                resolved: 0,
                lastUpdated: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            municipalityName: municipality.district_name,
            pending: municipality.pending || 0,
            resolved: municipality.resolved || 0,
            lastUpdated: municipality.lastUpdated || municipality.createdAt
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/complaints/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const Complaint = require('../models/Complaint');
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }
        
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const complaints = await Complaint.find({ user_imei: user.imei_id })
            .sort({ createdAt: -1 });
        
        res.json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
