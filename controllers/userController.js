const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Municipal = require('../models/Municipal');

exports.loginUser = async (req, res) => {
    try {
        const { imei_id } = req.body;
        let user = await User.findOne({ imei_id });
        if (!user) {
            user = await User.create({ imei_id });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const totalPending = await Complaint.countDocuments({ status: "Pending" });
        const totalSolved = await Complaint.countDocuments({ status: "Solved" });
        
        res.json({ success: true, stats: { totalPending, totalSolved } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getLeaderboard = async (req, res) => {
    try {
        const municipalities = await Municipal.find({}, 'district_name solved pending');
        
        const leaderboard = municipalities.map(m => {
            const total = m.solved + m.pending;
            const ratio = total === 0 ? 0 : (m.solved / total) * 100;
            return { district: m.district_name, ratio: ratio.toFixed(2), solved: m.solved, total };
        });

        leaderboard.sort((a, b) => b.ratio - a.ratio);

        res.json({ success: true, leaderboard });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.submitComplaint = async (req, res) => {
    try {
        const { title, location, latitude, longitude, description, imageUrl, user_imei, municipality_id } = req.body;
        
        const complaint = await Complaint.create({
            title,
            location,
            latitude,
            longitude,
            description,
            imageUrl,
            user_imei,
            municipality_id,
            status: "Pending"
        });

        const user = await User.findOne({ imei_id: user_imei });
        if (user) {
            user.complaints.push(complaint._id);
            await user.save();
        }

        res.json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getUserComplaints = async (req, res) => {
    try {
        const { imei_id } = req.query;
        const complaints = await Complaint.find({ user_imei: imei_id }).sort({ createdAt: -1 });
        res.json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};