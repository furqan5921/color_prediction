const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    upiId: {
        type: String
    },
    bankName: {
        type: String
    },
    ifscCode: {
        type: String
    },
    accountNumber: {
        type: String
    },
    branchName: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    processedAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Withdrawal', withdrawalSchema); 