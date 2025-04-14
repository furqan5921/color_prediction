const { referalCodeModels } = require('../models/refralCode');

// Get All Referral Codes
const getAllReferralCodes = async (req, res) => {
    try {
        const codes = await referalCodeModels.find().sort({ createdAt: -1 });
        res.status(200).json(codes);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Referral Code by ID
const getReferralCodeById = async (req, res) => {
    try {
        const { id } = req.params;
        const code = await referalCodeModels.findById(id);
        if (!code) {
            return res.status(404).json({ message: 'Referral code not found' });
        }
        res.status(200).json(code);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Add New Referral Code
const addReferralCode = async (req, res) => {
    try {
        const { referalCode } = req.body;
        const newCode = new referalCodeModels({ referalCode });
        await newCode.save();
        res.status(201).json({ message: 'Referral code added successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Delete Referral Code
const deleteReferralCode = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCode = await referalCodeModels.findByIdAndDelete(id);
        if (!deletedCode) {
            return res.status(404).json({ message: 'Referral code not found' });
        }
        res.status(200).json({ message: 'Referral code deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { 
    getAllReferralCodes, 
    getReferralCodeById, 
    addReferralCode, 
    deleteReferralCode 
};
