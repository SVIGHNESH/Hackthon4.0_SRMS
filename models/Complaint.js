const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
    title: { type: String, required: true },
    location: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    status: { type: String, default: "Pending", enum: ["Pending", "In Progress", "Solved", "Rejected", "Escalated"] },
    description: { type: String, required: true },
    imageUrl: { type: String, default: null },
    operatorImageUrl: { type: String, default: null },
    geminiVerified: { type: Boolean, default: false },
    verificationConfidence: { type: Number, default: null },
    verificationReason: { type: String, default: null },
    user_imei: { type: String, required: true },
    municipality_id: { type: mongoose.Schema.Types.ObjectId, ref: 'municipality_new' },
    municipalityName: { type: String, default: "", index: true },
    type: { type: String, default: "" },
    stateName: { type: String, default: "" },
    evidenceUrl: { type: String, default: null },
    assignedTo: { type: String, default: null },
    timeline: [{
        status: { type: String },
        description: { type: String },
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model("Complaints", ComplaintSchema);