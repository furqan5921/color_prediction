const mongoose = require('mongoose');
const colorSchema = new mongoose.Schema({
    referalId: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    roundId : { type: String },
    // walletBalance: { type: String, default: 1000 },
    betAmout: { type: Number, default: 0 },
    predictedColor: { type: String },
    resultColor: { type: String },
    winAmt: { type: Number },
    number: { type: Number },
    isWin:{type:String, default:null},
    createdAt: { type: Date, default: Date.now }
});
const colorModels = mongoose.model('color', colorSchema);
module.exports = { colorModels };
