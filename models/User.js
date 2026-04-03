const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  imei_id: { type: String, required: true, unique: true },
  complaints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Complaints' }],
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
