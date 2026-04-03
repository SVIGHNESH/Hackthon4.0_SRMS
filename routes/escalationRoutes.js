const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Complaint = require('../models/Complaint');
const Municipal = require('../models/Municipal');
const State = require('../models/State');
const authMiddleware = require('../middleware/auth');

router.get('/escalated-complaints', authMiddleware, async (req, res) => {
    try {
        const escalatedComplaints = await Complaint.find({ status: 'Escalated' })
            .sort({ updatedAt: -1 });
        
        res.json({ success: true, complaints: escalatedComplaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/auto-escalate', authMiddleware, async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = await Complaint.updateMany(
            {
                status: { $in: ['Pending', 'In Progress'] },
                createdAt: { $lt: sevenDaysAgo }
            },
            {
                $set: { status: 'Escalated' },
                $push: {
                    timeline: {
                        status: 'Escalated',
                        description: 'Auto-escalated: Not resolved within 7 days',
                        date: new Date()
                    }
                }
            }
        );

        res.json({ 
            success: true, 
            message: `Escalated ${result.modifiedCount} complaints`,
            count: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/all-municipalities', authMiddleware, async (req, res) => {
    try {
        const municipalities = await Municipal.find({});
        res.json({ success: true, districts: municipalities });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/municipalities/:state', authMiddleware, async (req, res) => {
    try {
        const { state } = req.params;
        const municipalities = await Municipal.find({ 
            state_name: { $regex: new RegExp(state, 'i') }
        });
        res.json({ success: true, districts: municipalities });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/fetch-complaints-by-municipality', authMiddleware, async (req, res) => {
    try {
        const { municipalityName } = req.body;
        
        if (!municipalityName) {
            return res.json({ success: true, complaints: [] });
        }

        const complaints = await Complaint.find({ 
            municipalityName: { $regex: new RegExp('^' + municipalityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
        }).sort({ createdAt: -1 });

        res.json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/states', authMiddleware, async (req, res) => {
    try {
        const states = await State.find({});
        res.json({ success: true, states });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
