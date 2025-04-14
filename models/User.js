const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  referalId: { type: String },
  username: { type: String },
  // mobileNumber: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wallet: { type: Number, default: 1500 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
module.exports = User;