const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    imei_id: { type: String, required: true, unique: true },
    rewardPoints: { type: Number, default: 0 },
    complaints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Complaints' }],
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);