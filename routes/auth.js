const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { referalCodeModels } = require('../models/refralCode');
const crypto = require('crypto'); // Add crypto for generating reset tokens
const JWT_SECRET = 'bunneybet';

// Add a model for password reset tokens
const PasswordReset = require('../models/PasswordReset');

router.post('/signup', async (req, res) => {
  const { username, email, password, referalId } = req.body;
  // console.log(req.body)
  // Ensure all fields are provided
  const referal = await referalCodeModels.findOne({ referalCode: referalId });
  console.log(referal, referalId, "referal")
  if (!referal) {
    return res.status(400).json({ message: 'Invalid referal Id' });
  }
  if (!referalId || !username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create a new user
    const newUser = new User({
      referalId: referalId,
      username,
      email,
      password: hashedPassword,
      // userNo: userNo,
      wallet: 15000,
    });

    const savedUser = await newUser.save();
    console.log(savedUser)

    await savedUser.save();

    const token = jwt.sign({ id: savedUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Generate token
    res.status(201).json({
      message: 'User registered successfully',
      token, // Include token in the response
      user: { id: savedUser._id, username: savedUser.username, email: savedUser.email, userNo: savedUser.userNo, referalId: savedUser.referalId },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



// Login Route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username }).populate('wallet');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in the environment variables.");
      return res.status(500).json({ message: "Server configuration error." });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Use process.env.JWT_SECRET
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        walletBalance: user.wallet || 0,
        referalId: user.referalId,
        role: user.role
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/name/:id', async (req, res) => {
  const { id } = req.params;
  // console.log(id, "id")

  try {
    // Find the user and wallet by ID
    const user = await User.findById(id);
    // const user = await User.find();
    // const wallet = await User_Wallet.findOne({ user: id });
    // console.log(user)
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

// Request password reset
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpires = Date.now() + 3600000; // 1 hour from now

    // Store the reset token in the database
    await PasswordReset.findOneAndDelete({ userId: user._id }); // Delete any existing token

    await PasswordReset.create({
      userId: user._id,
      token: resetToken,
      expires: resetTokenExpires
    });

    // In a real app, you would send an email with a reset link
    // For this demo, we'll just return the token
    res.status(200).json({
      message: 'Password reset token generated successfully',
      resetToken,
      // In production, you would not return the token in the response
      // This is just for demonstration purposes
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify reset token
router.post('/verify-reset-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    // Find token in database
    const passwordReset = await PasswordReset.findOne({
      token,
      expires: { $gt: Date.now() }
    });

    if (!passwordReset) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    res.status(200).json({ message: 'Token is valid', userId: passwordReset.userId });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // Find token in database
    const passwordReset = await PasswordReset.findOne({
      token,
      expires: { $gt: Date.now() }
    });

    if (!passwordReset) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Find user
    const user = await User.findById(passwordReset.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    user.password = hashedPassword;
    await user.save();

    // Delete the used token
    await PasswordReset.findOneAndDelete({ token });

    res.status(200).json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;