const mongoose = require('mongoose');

const OperatorSchema = new mongoose.Schema({
    official_username: { type: String, required: true, unique: true },
    hashed_password: { type: String, required: true },
    municipality_id: { type: mongoose.Schema.Types.ObjectId, ref: 'municipality_new' },
    district_name: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Operator", OperatorSchema);