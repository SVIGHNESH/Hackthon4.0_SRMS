const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
    title: { type: String, required: true },
    location: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    status: { type: String, default: "Pending", enum: ["Pending", "In Progress", "Solved", "Rejected"] },
    description: { type: String, required: true },
    imageUrl: { type: String, default: null },
    operatorImageUrl: { type: String, default: null },
    geminiVerified: { type: Boolean, default: false },
    user_imei: { type: String, required: true },
    municipality_id: { type: mongoose.Schema.Types.ObjectId, ref: 'municipality_new' },
}, { timestamps: true });

module.exports = mongoose.model("Complaints", ComplaintSchema);