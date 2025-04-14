const mongoose = require('mongoose');
const randomcolorSchema = new mongoose.Schema({
    roundId: { type: String },
    randomNumber: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const randomcolorModels = mongoose.model('randomcolor', randomcolorSchema);
module.exports = { randomcolorModels };
