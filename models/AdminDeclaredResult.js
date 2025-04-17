const mongoose = require('mongoose');

const adminDeclaredResultSchema = new mongoose.Schema({
    roundId: {
        type: String,
        required: true,
        unique: true, // Only one admin-declared result per round
        index: true
    },
    resultNumber: {
        type: Number,
        required: true,
        min: 0,
        max: 9
    },
    resultColor: {
        type: String,
        required: true,
        enum: ['red', 'green', 'violet']
    },
    declaredAt: {
        type: Date,
        default: Date.now
    },
    isApplied: {
        type: Boolean,
        default: false // Tracks if this result has been applied to the game
    },
    appliedAt: {
        type: Date,
        default: null
    }
});

// Method to check if a round has a declared result
adminDeclaredResultSchema.statics.hasResult = async function (roundId) {
    const result = await this.findOne({ roundId });
    return !!result;
};

// Method to get declared result for a round
adminDeclaredResultSchema.statics.getResult = async function (roundId) {
    return await this.findOne({ roundId });
};

// Method to mark a result as applied
adminDeclaredResultSchema.statics.markAsApplied = async function (roundId) {
    return await this.findOneAndUpdate(
        { roundId },
        { isApplied: true, appliedAt: new Date() },
        { new: true }
    );
};

const AdminDeclaredResult = mongoose.model('AdminDeclaredResult', adminDeclaredResultSchema);
module.exports = AdminDeclaredResult; 