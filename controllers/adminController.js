const State = require('../models/State');
const Municipal = require('../models/Municipal');
const Complaint = require('../models/Complaint');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ memoryStorage: true });

exports.stateLogin = async (req, res) => {
    try {
        const { enteredUserName, enteredPassword } = req.body;
        
        const state = await State.findOne({ official_username: enteredUserName });
        if (!state) return res.status(401).json({ success: false, message: "User not found" });

        const isMatch = await bcrypt.compare(enteredPassword, state.hashed_password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password" });

        const token = jwt.sign({ id: state._id, state_id: state.state_id }, process.env.JWT_SECRET, { expiresIn: "12h" });
        const { hashed_password, ...safeState } = state.toObject();
        res.json({ success: true, state: safeState, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fetchAllDistricts = async (req, res) => {
    try {
        const { id } = req.body;
        const districts = await Municipal.find({ state_id: id });
        const state = await State.findOne({ state_id: id });
        res.json({ success: true, districts, state });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fetchAllDistrictsPublic = async (req, res) => {
    try {
        const districts = await Municipal.find({});
        res.json({ success: true, districts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fetchDistrictById = async (req, res) => {
    try {
        const { id } = req.body;
        const district = await Municipal.findOne({ district_id: id });
        if (!district) return res.status(404).json({ success: false, message: "District not found" });
        res.json({ success: true, district });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.municipalLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const municipal = await Municipal.findOne({ official_username: username });
        if (!municipal) return res.status(401).json({ success: false, message: "User not found" });

        const isMatch = await bcrypt.compare(password, municipal.hashed_password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password" });

        const token = jwt.sign({ id: municipal._id, district_id: municipal.district_id }, process.env.JWT_SECRET, { expiresIn: "12h" });
        const { hashed_password, ...safeMunicipal } = municipal.toObject();
        res.json({ success: true, user: safeMunicipal, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fetchComplaintsByMunicipality = async (req, res) => {
    try {
        const { municipalityName } = req.body;
        if (!municipalityName) {
            return res.json({ success: true, complaints: [] });
        }
        const name = municipalityName.trim();
        const complaints = await Complaint.find({ 
            municipalityName: { $regex: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") } 
        });
        res.json({ success: true, complaints: complaints || [] });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

exports.getComplaintCategories = async (req, res) => {
    try {
        const categories = [
            { id: 1, name: 'Potholes', icon: '🕳️', color: 'orange' },
            { id: 2, name: 'Garbage', icon: '🗑️', color: 'green' },
            { id: 3, name: 'Street Light', icon: '💡', color: 'yellow' },
            { id: 4, name: 'Drainage', icon: '🚰', color: 'blue' },
            { id: 5, name: 'Sewage', icon: '🚿', color: 'brown' },
            { id: 6, name: 'Roads', icon: '🛣️', color: 'gray' },
            { id: 7, name: 'Traffic Light', icon: '🚦', color: 'red' },
            { id: 8, name: 'Water Supply', icon: '💧', color: 'cyan' },
            { id: 9, name: 'Graffiti', icon: '🎨', color: 'purple' }
        ];
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching categories" });
    }
};

exports.getStateStats = async (req, res) => {
    try {
        const { state_id } = req.body;
        const municipalities = await Municipal.find({ state_id });
        
        let totalSolved = 0;
        let totalPending = 0;
        
        municipalities.forEach(m => {
            totalSolved += m.solved || 0;
            totalPending += m.pending || 0;
        });

        res.json({ success: true, stats: { totalSolved, totalPending } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const { normaliseStatus, isValidStatus, CANONICAL_STATUSES } = require('../utils/statusHelper');

exports.updateComplaintStatus = async (req, res) => {
    try {
        const { complaintId, status, assignedTo } = req.body;
        
        const normalizedStatus = normaliseStatus(status);
        if (!isValidStatus(normalizedStatus)) {
            return res.status(400).json({ success: false, message: `Invalid status` });
        }
        
        const complaint = await Complaint.findById(complaintId);
        
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        
        const previousStatus = complaint.status;
        
        complaint.status = normalizedStatus;
        if (assignedTo) complaint.assignedTo = assignedTo;
        complaint.timeline.push({ status: previousStatus, description: `Status changed to ${normalizedStatus}`, date: new Date() });
        await complaint.save();
        
        if (previousStatus !== 'Solved' && normalizedStatus === 'Solved') {
            await Municipal.findOneAndUpdate(
                { district_name: complaint.municipalityName },
                { $inc: { solved: 1, pending: -1 } }
            );
        }
        
        res.json({ success: true, complaint, message: 'Complaint updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getComplaintById = async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid complaint ID format' });
        }
        
        const complaint = await Complaint.findById(id);
        
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        
        res.json({ success: true, complaint });
    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({ success: false, message: 'Invalid complaint ID format' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.uploadEvidence = async (req, res) => {
    try {
        const { complaintId } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'complaint-evidence', resource_type: 'auto' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.buffer);
        });
        
        const complaint = await Complaint.findById(complaintId);
        
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        
        complaint.evidenceUrl = result.secure_url;
        complaint.timeline.push({ status: complaint.status, description: 'Evidence uploaded', date: new Date() });
        await complaint.save();
        
        res.json({ success: true, url: result.secure_url, complaint, message: 'Evidence uploaded successfully. Use /complaint/update to mark as solved.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getComplaintsWithFilters = async (req, res) => {
    try {
        const { municipalityName, status, category, date, complaintId, page = 1, limit = 10 } = req.body;
        
        const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 10));
        const safePage = Math.max(1, parseInt(page) || 1);
        
        const query = {};
        if (municipalityName) {
            const name = municipalityName.trim();
            query.municipalityName = { $regex: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") };
        }
        if (status) query.status = status;
        if (category) query.type = category;
        if (complaintId) {
            if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({ success: false, message: 'Invalid complaint ID format' });
            }
            query._id = complaintId;
        }
        
        if (date) {
            const startDate = new Date(date);
            if (isNaN(startDate.getTime())) {
                return res.status(400).json({ success: false, message: 'Invalid date format' });
            }
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: startDate, $lte: endDate };
        }
        
        const complaints = await Complaint.find(query)
            .limit(safeLimit)
            .skip((safePage - 1) * safeLimit)
            .sort({ createdAt: -1 });
        
        const count = await Complaint.countDocuments(query);
        
        res.json({
            success: true,
            complaints,
            totalPages: Math.ceil(count / safeLimit),
            currentPage: safePage,
            totalComplaints: count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};