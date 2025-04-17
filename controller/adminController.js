const express = require('express');
const router = express.Router();
const Admin = require('../models/adminModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const JWT_SECRET = 'bunneybet';
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const Deposit = require('../models/Deposit');
const PaymentSettings = require('../models/PaymentSettings');
const { colorModels } = require('../models/ColorModel');
const mongoose = require('mongoose');

router.post('/api/admin/signup', async (req, res) => {
  const { username, email, password } = req.body;
  console.log(req.body)
  try {
    // Check if the user already exists
    const existingUser = await Admin.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create a new user
    const newUser = new Admin({
      username,
      email,
      password: hashedPassword,
    });

    const savedUser = await newUser.save();
    console.log(savedUser)

    await savedUser.save();

    // Respond with success
    res.status(201).json({
      message: 'User registered successfully',
      savedUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login Route
router.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const user = await Admin.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin middleware to verify admin role
const isAdmin = async (req, res, next) => {
  try {
    // Get user information from request (assuming you have authentication middleware)
    const userId = req.user?.id; // Adjust based on your auth implementation

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all withdrawal requests
router.get('/api/admin/withdrawal-requests', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find().sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawal requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all deposit requests
router.get('/api/admin/deposit-requests', async (req, res) => {
  try {
    const deposits = await Deposit.find().sort({ createdAt: -1 });
    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposit requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add deposit request (new endpoint)
router.post('/api/admin/deposit-request', async (req, res) => {
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

// Add withdrawal request for admin panel
router.post('/api/admin/withdrawal-request', async (req, res) => {
  try {
    console.log("Admin withdrawal request received:", req.body);

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
        message: `Insufficient balance. User has ₹${user.wallet.toFixed(2)} but requested ₹${amount.toFixed(2)}`
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
    res.status(201).json({
      success: true,
      message: 'Withdrawal request created successfully',
      withdrawal
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

// Update withdrawal request status
router.put('/api/admin/withdrawal-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const withdrawal = await Withdrawal.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    // If status is changing to approved or rejected, update the user's wallet
    if (status !== withdrawal.status) {
      if (status === 'approved' && withdrawal.status !== 'approved') {
        // Find the user and update their wallet balance
        const user = await User.findById(withdrawal.userId);

        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has enough balance
        if (user.wallet < withdrawal.amount) {
          return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Reduce the balance if approved
        user.wallet -= withdrawal.amount;
        await user.save();
      } else if (status === 'rejected' && withdrawal.status === 'approved') {
        // If changing from approved to rejected, we need to refund
        const user = await User.findById(withdrawal.userId);

        if (user) {
          user.wallet += withdrawal.amount;
          await user.save();
        }
      }

      withdrawal.status = status;
      withdrawal.processedAt = new Date();
      await withdrawal.save();
    }

    res.json(withdrawal);
  } catch (error) {
    console.error('Error updating withdrawal request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update deposit request status
router.put('/api/admin/deposit-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const deposit = await Deposit.findById(id);

    if (!deposit) {
      return res.status(404).json({ message: 'Deposit request not found' });
    }

    // If status is changing to approved or rejected, update the user's wallet
    if (status !== deposit.status) {
      if (status === 'approved' && deposit.status !== 'approved') {
        // Find the user and update their wallet balance
        const user = await User.findById(deposit.userId);

        if (user) {
          // Add the deposit amount to the user's wallet
          user.wallet += deposit.amount;
          await user.save();
        }
      } else if (status === 'rejected' && deposit.status === 'approved') {
        // If changing from approved to rejected, we need to remove the funds
        const user = await User.findById(deposit.userId);

        if (user) {
          user.wallet -= deposit.amount;
          // Ensure wallet doesn't go negative
          user.wallet = Math.max(0, user.wallet);
          await user.save();
        }
      }

      deposit.status = status;
      deposit.processedAt = new Date();
      await deposit.save();
    }

    res.json(deposit);
  } catch (error) {
    console.error('Error updating deposit request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get payment settings
router.get('/api/admin/payment-settings', async (req, res) => {
  try {
    const settings = await PaymentSettings.getSingletonInstance();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update payment settings
router.put('/api/admin/payment-settings', async (req, res) => {
  try {
    const { upiId, phoneNumber, qrCodeUrl } = req.body;

    // Validation
    if (!upiId || !phoneNumber) {
      return res.status(400).json({ message: 'UPI ID and Phone Number are required' });
    }

    const settings = await PaymentSettings.getSingletonInstance();

    settings.upiId = upiId;
    settings.phoneNumber = phoneNumber;

    if (qrCodeUrl) {
      settings.qrCodeUrl = qrCodeUrl;
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get admin dashboard stats
router.get('/api/admin/stats', async (req, res) => {
  console.log("Getting admin stats");
  try {
    // Count total users
    const totalUsers = await User.countDocuments();
    console.log("Total users:", totalUsers);

    // Count active users (users who have made a bet in the last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    let activeUsers = 0;
    try {
      const activeGames = await colorModels.find({ createdAt: { $gte: oneDayAgo } });
      const activeUserIds = new Set(activeGames.map(game => game.user ? game.user.toString() : null).filter(Boolean));
      activeUsers = activeUserIds.size;
      console.log("Active users:", activeUsers);
    } catch (activeUserError) {
      console.error("Error counting active users:", activeUserError);
    }

    // Sum of all approved deposits
    let totalDeposits = 0;
    try {
      const approvedDeposits = await Deposit.find({ status: 'approved' });
      totalDeposits = approvedDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
      console.log("Total deposits:", totalDeposits);
    } catch (depositError) {
      console.error("Error calculating total deposits:", depositError);
    }

    // Sum of all approved withdrawals
    let totalWithdrawals = 0;
    try {
      const approvedWithdrawals = await Withdrawal.find({ status: 'approved' });
      totalWithdrawals = approvedWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
      console.log("Total withdrawals:", totalWithdrawals);
    } catch (withdrawalError) {
      console.error("Error calculating total withdrawals:", withdrawalError);
    }

    const stats = {
      totalUsers,
      activeUsers,
      totalDeposits,
      totalWithdrawals
    };

    console.log("Returning stats:", stats);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      message: 'Internal server error',
      totalUsers: 0,
      activeUsers: 0,
      totalDeposits: 0,
      totalWithdrawals: 0
    });
  }
});

// Check if user is an admin
router.get('/admin/check-status', async (req, res) => {
  try {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    console.log("🚀 ~ router.get ~ authHeader:", authHeader)

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ isAdmin: false, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || JWT_SECRET);
    const userId = decoded.id;

    // Find user by ID
    const user = await User.findById(userId);
    console.log(user, "user")
    if (!user) {
      return res.status(404).json({ isAdmin: false, message: 'User not found' });
    }

    // Check if user has admin role
    const isAdmin = user.role === 'admin';

    res.json({ isAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(401).json({ isAdmin: false, message: 'Invalid token' });
  }
});

// Debug route to check if admin controller is working
router.get('/api/admin/debug', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Admin controller is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in debug route:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;