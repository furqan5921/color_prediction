const mongoose = require('mongoose');
const referalCodeSchema = new mongoose.Schema({
    referalCode:{type:String},
    createdAt: { type: Date, default: Date.now }
});
const referalCodeModels = mongoose.model('referalCode', referalCodeSchema);
module.exports = { referalCodeModels };
