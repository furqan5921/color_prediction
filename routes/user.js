const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
// const authMiddleware = require('../middleware/auth');

// Fetch user profil
// router.get('/profile/:id', async (req, res) => {
//   console.log("ok")
//   const { id } = req.params;
//   try {
//     const user = await User.findById(id); // Exclude password
//     if (!user) throw new Error('User not found');
//     // res.json(user);

//     res.json({
//       referalId: user.referalId,
//       email: user.email,
//       wallet: user.wallet || 0,
//       username: user.username,
//       // userNo: user.userNo 
//     });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });


router.get('/api/name/:id', async (req, res) => {
  const { id } = req.params;
  console.log(id, "id")

  try {
    // Find the user and wallet by ID
    const user = await User.findById(id);
    // const user = await User.find();
    // const wallet = await User_Wallet.findOne({ user: id });
    console.log(user)
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Respond with username, wallet balance, exposure balance, and email
    res.json({
      referalId: user.referalId,
      email: user.email,
      wallet: user.wallet || 0,
      username: user.username,
      // userNo: user.userNo 
    });
  } catch (error) {
    console.error('Error fetching user:', error);

    res.status(500).json({ message: error.message });
  }
});

// Add these routes for deposit and withdrawal
router.post('/api/withdrawal-request', async (req, res) => {
  try {
    console.log("Withdrawal request received:", req.body);

    const {
      userId,
      username,
      amount,
      mobile,
      upiId,
      bankName,
      ifscCode,
      accountNumber,
      branchName
    } = req.body;

    // Validate the input with detailed error messages
    const missingFields = [];
    if (!userId) missingFields.push('userId');
    if (!username) missingFields.push('username');
    if (!amount) missingFields.push('amount');
    if (!mobile) missingFields.push('mobile');
    if (!upiId && !(bankName && ifscCode && accountNumber)) {
      missingFields.push('payment method (UPI ID or bank details)');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const Withdrawal = require('../models/Withdrawal');

    // Convert userId to ObjectId if it's a valid string ID
    let userObjectId;
    try {
      userObjectId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : null;
    } catch (error) {
      console.error('Error converting userId to ObjectId:', error);
      userObjectId = null;
    }

    if (!userObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId format'
      });
    }

    // Find user to check wallet balance
    const user = await User.findById(userObjectId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate if user has enough balance
    if (user.wallet < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You have ₹${user.wallet.toFixed(2)} but requested ₹${amount.toFixed(2)}`
      });
    }

    // Create a new withdrawal request
    const withdrawal = new Withdrawal({
      userId: userObjectId,
      username,
      amount: Number(amount),
      mobile,
      upiId,
      bankName,
      ifscCode,
      accountNumber,
      branchName,
      status: 'pending'
    });

    await withdrawal.save();

    // Return current wallet balance for UI update
    res.status(201).json({
      success: true,
      message: 'Withdrawal request created successfully',
      withdrawal,
      currentBalance: user.wallet
    });
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

router.post('/api/deposit-request', async (req, res) => {
  try {
    console.log("Deposit request received:", req.body);

    const { userId, username, amount, mobile, utrNumber } = req.body;

    // Validate the input with detailed error messages
    const missingFields = [];
    if (!userId) missingFields.push('userId');
    if (!username) missingFields.push('username');
    if (!amount) missingFields.push('amount');
    if (!mobile) missingFields.push('mobile');
    if (!utrNumber) missingFields.push('utrNumber');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const Deposit = require('../models/Deposit');

    // Convert userId to ObjectId if it's a valid string ID
    let userObjectId;
    try {
      userObjectId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : null;
    } catch (error) {
      console.error('Error converting userId to ObjectId:', error);
      userObjectId = null;
    }

    if (!userObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId format'
      });
    }

    // Create a new deposit request
    const deposit = new Deposit({
      userId: userObjectId,
      username,
      amount: Number(amount),
      mobile,
      utrNumber,
      status: 'pending'
    });

    await deposit.save();
    res.status(201).json({
      success: true,
      message: 'Deposit request created successfully',
      deposit
    });
  } catch (error) {
    console.error('Error creating deposit request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get payment settings
router.get('/api/payment-settings', async (req, res) => {
  try {
    const PaymentSettings = require('../models/PaymentSettings');
    const settings = await PaymentSettings.getSingletonInstance();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;