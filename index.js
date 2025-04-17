const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config(); // Ensure .env variables are loaded

// Import your routes and models (adjust paths as needed)
const authRoutes = require('./routes/auth');
const adminRoutes = require('./controller/adminController'); // Check if this is correct, might be routes/admin
const userRoutes = require('./routes/user'); // Check if this is correct, might be routes/user
const colorPredictionRoutes = require('./routes/colorRoutes');
const { colorModels } = require('./models/ColorModel'); // Bet history model
const User = require('./models/User'); // User model
const AdminDeclaredResult = require('./models/AdminDeclaredResult'); // Import admin declared result model

const app = express();
const server = http.createServer(app);

// --- Configure CORS ---
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://kingmills.vercel.app", // Your production frontend URL from .env
  "http://localhost:5173" // Your local development frontend URL
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin OR from allowed origins
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true, // Allow cookies if needed for authentication
};

app.use(cors(corsOptions));
app.use(express.json()); // Middleware to parse JSON bodies

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // useCreateIndex: true, // Deprecated - remove if causing issues
  // useFindAndModify: false, // Deprecated - remove if causing issues
})
  .then(() => console.log(`[${new Date().toISOString()}] MongoDB connected successfully`))
  .catch(err => {
    console.error(`[${new Date().toISOString()}] FATAL: MongoDB connection error:`, err.message);
    process.exit(1); // Exit if DB connection fails
  });

// --- API Routes ---
// Add logging for debugging route issues
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Mount all routes correctly
app.use('/api', authRoutes);

// Make sure user routes are properly mounted directly at /api
// This is crucial for /api/withdrawal-request and /api/deposit-request
app.use('/', userRoutes); // Mount at root level since the routes already include /api prefix

// Game related routes
app.use('/api/color', colorPredictionRoutes);

// Admin routes - mount at root level since adminController already includes full paths
app.use('/', adminRoutes); // Changed from '/api/admin' to '/' because routes already have '/api/admin' prefix

// Add a debug endpoint to track all registered routes
app.get('/api/routes', (req, res) => {
  const routes = [];

  // Express 4.x - iterate through registered routes
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      // Routes registered directly on the app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const path = handler.route.path;
          routes.push({
            path: path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });

  // Log all routes to a file for debugging
  const fs = require('fs');
  fs.writeFileSync('./logs/api_routes.log', JSON.stringify(routes, null, 2));

  res.json({ routes });
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});


// --- Socket.IO Setup ---
const io = new Server(server, {
  cors: corsOptions, // Use the same CORS options for Socket.IO
  pingInterval: 10000, // Send pings every 10 seconds
  pingTimeout: 5000,   // Consider unresponsive after 5 seconds without pong
  transports: ['websocket'], // Prioritize WebSocket
});

// --- Centralized Game Logic ---

let timerDuration = parseInt(process.env.GAME_DURATION_SECONDS) || 120; // Duration from .env or default 3 minutes
let timeLeft = timerDuration;
let currentRoundId = `R${Date.now()}`; // Initial round ID
let isProcessingResults = false; // Flag to prevent concurrent processing
let gameTimerInterval = null; // Holds the setInterval ID for the game loop

// Make game state available to middleware
app.locals.gameState = {
  currentRoundId,
  timeLeft,
  timerDuration,
};

// Create a circular buffer to store the last 20 round results
app.locals.roundResults = [];
const MAX_ROUND_RESULTS = 20;

// --- Helper Functions ---

// Determines color based on number result (0-9)
const getColorForResult = (number) => {
  if (number === 0 || number === 5) return 'violet';
  if (number % 2 === 0) return 'red'; // Even numbers (2, 4, 6, 8)
  return 'green'; // Odd numbers (1, 3, 7, 9)
};

// Generates the definitive result (a number 0-9)
const generateRoundResult = () => {
  // Add logic here if you want specific number probabilities, otherwise pure random:
  return Math.floor(Math.random() * 10); // Generates an integer between 0 and 9
};

// --- Main Game Loop Function ---
const runGameCycle = async () => {
  // Prevent overlapping execution if processing takes longer than 1 second
  if (isProcessingResults) {
    // console.log(`[${new Date().toISOString()}] Cycle skipped: Processing results in progress for round ${currentRoundId}.`);
    return;
  }

  if (timeLeft > 0) {
    // --- Timer Ticking Down ---
    timeLeft -= 1;
    io.emit("timerUpdate", { timeLeft, roundId: currentRoundId });

    // Update app.locals game state with each tick
    app.locals.gameState = {
      currentRoundId,
      timeLeft,
      timerDuration,
    };

    // console.log(`[${new Date().toISOString()}] Timer Tick: Round ${currentRoundId}, Time Left: ${timeLeft}`); // Verbose logging

  } else {
    // --- Timer Ended - Process Results ---
    isProcessingResults = true; // LOCK processing
    const completedRoundId = currentRoundId; // Capture the round ID that just finished
    console.log(`[${new Date().toISOString()}] Timer ended for round ${completedRoundId}. Processing results...`);
    io.emit("timerEnded", { roundId: completedRoundId, message: "Processing results..." });

    try {
      // 1. Check if there's an admin-declared result for this round
      const adminDeclaredResult = await AdminDeclaredResult.findOne({ roundId: completedRoundId });

      let randomNumberResult, resultColorName;

      if (adminDeclaredResult) {
        // Use the admin-declared result
        randomNumberResult = adminDeclaredResult.resultNumber;
        resultColorName = adminDeclaredResult.resultColor;

        console.log(`[${new Date().toISOString()}] Using ADMIN-DECLARED result for round ${completedRoundId}: Number=${randomNumberResult}, Color=${resultColorName}`);

        // Mark the admin result as applied
        await AdminDeclaredResult.markAsApplied(completedRoundId);
      } else {
        // No admin-declared result, generate a random result
        randomNumberResult = generateRoundResult();
        resultColorName = getColorForResult(randomNumberResult); // Get corresponding color

        console.log(`[${new Date().toISOString()}] Round ${completedRoundId} result RANDOMLY generated: Number=${randomNumberResult}, Color=${resultColorName}`);
      }

      // Store the result in the app.locals.roundResults array
      app.locals.roundResults.unshift({
        roundId: completedRoundId,
        result: randomNumberResult,
        resultColor: resultColorName,
        timestamp: new Date()
      });

      // Keep only the latest MAX_ROUND_RESULTS results
      if (app.locals.roundResults.length > MAX_ROUND_RESULTS) {
        app.locals.roundResults = app.locals.roundResults.slice(0, MAX_ROUND_RESULTS);
      }

      // Store result in database (independent of bets)
      try {
        // Create a standalone result record
        await colorModels.create({
          roundId: completedRoundId,
          resultColor: String(randomNumberResult),
          createdAt: new Date(),
          isSystemGenerated: true, // Flag to indicate this is a system-generated result record
          predictedColor: null,     // No user prediction for system records
          betAmout: 0,              // No bet amount for system records
          user: null                // No user for system records
        });
        console.log(`[${new Date().toISOString()}] Stored standalone result for round ${completedRoundId}: ${randomNumberResult}`);
      } catch (resultStoreError) {
        console.error(`[${new Date().toISOString()}] Error storing standalone result for round ${completedRoundId}:`, resultStoreError);
        // Continue processing even if result storage fails
      }

      // 2. Find all bets placed for the completed round
      const betsForRound = await colorModels.find({ roundId: completedRoundId });
      console.log(`[${new Date().toISOString()}] Found ${betsForRound.length} bets for round ${completedRoundId}.`);

      // Group bets by user to ensure proper multiple bet handling
      const betsByUser = {};
      betsForRound.forEach(bet => {
        if (!betsByUser[bet.user]) {
          betsByUser[bet.user] = [];
        }
        betsByUser[bet.user].push(bet);
      });

      // Process each user's bets as a group
      const processingPromises = Object.keys(betsByUser).map(async (userId) => {
        try {
          const user = await User.findById(userId);
          if (!user) {
            console.warn(`[${new Date().toISOString()}] User ${userId} not found. Skipping ${betsByUser[userId].length} bets.`);
            return;
          }

          let totalWinAmount = 0;
          let totalRefundAmount = 0;
          let originalUserWallet = user.wallet;

          // Process each bet from this user
          for (const bet of betsByUser[userId]) {
            let winAmount = 0;
            let isWinner = false;
            let calculatedMultiplier = 0;

            const predictedValue = bet.predictedColor; // User's prediction
            const betAmount = bet.betAmout;

            // --- Determine Win/Loss based on Requirements ---
            // Case A: Bet on specific number ('0' through '9')
            if (!isNaN(parseInt(predictedValue)) && parseInt(predictedValue) === randomNumberResult) {
              isWinner = true;
              calculatedMultiplier = (randomNumberResult === 0) ? 3 : 2;
              console.log(`[DEBUG] User ${user._id} bet on NUMBER ${predictedValue}, Result ${randomNumberResult} -> WIN (Multiplier: ${calculatedMultiplier})`);
            }
            // Case B: Bet on color ('green', 'red', 'violet')
            else if (['green', 'red', 'violet'].includes(predictedValue) && predictedValue === resultColorName) {
              isWinner = true;
              if (predictedValue === 'violet') {
                calculatedMultiplier = 2;
              } else if (predictedValue === 'green' || predictedValue === 'red') {
                calculatedMultiplier = 2;
              }
              console.log(`[DEBUG] User ${user._id} bet on COLOR ${predictedValue}, Result Color ${resultColorName} -> WIN (Multiplier: ${calculatedMultiplier})`);
            } else {
              // If neither number nor color matches exactly -> Loss
              isWinner = false;
              console.log(`[DEBUG] User ${user._id} bet on ${predictedValue}, Result ${randomNumberResult}/${resultColorName} -> LOSS`);
            }

            // Calculate Payout
            if (isWinner) {
              winAmount = betAmount * calculatedMultiplier;
              totalWinAmount += winAmount;
              bet.winAmt = winAmount;
              bet.isWin = "Won";
              console.log(`[${new Date().toISOString()}] WIN: User ${user._id} won ${winAmount.toFixed(2)} (${calculatedMultiplier}x) from bet of ${betAmount} on ${predictedValue}`);
            } else {
              const refundAmount = betAmount * 0.05;
              totalRefundAmount += refundAmount;
              bet.winAmt = refundAmount;
              bet.isWin = "Lost";
              console.log(`[${new Date().toISOString()}] LOSS with REFUND: User ${user._id} received ${refundAmount.toFixed(2)} refund (5%) from bet of ${betAmount} on ${predictedValue}`);
            }

            // Set the result for this bet
            bet.resultColor = String(randomNumberResult);

            // Save the bet (but not the user yet)
            await bet.save();
          }

          // Update the user's wallet with all winnings/refunds in one go
          user.wallet += (totalWinAmount + totalRefundAmount);
          await user.save();

          // Update wallet balance in all bet records
          const finalWalletBalance = user.wallet;
          for (const bet of betsByUser[userId]) {
            bet.walletBalance = finalWalletBalance;
            await bet.save();
          }

          console.log(`[${new Date().toISOString()}] Processed ${betsByUser[userId].length} bets for User ${userId}: ` +
            `Total Winnings: ${totalWinAmount.toFixed(2)}, Refunds: ${totalRefundAmount.toFixed(2)}, ` +
            `Wallet: ${originalUserWallet.toFixed(2)} -> ${finalWalletBalance.toFixed(2)}`);

        } catch (betError) {
          console.error(`[${new Date().toISOString()}] Error processing bets for user ${userId}:`, betError);
        }
      });

      // Wait for all bet processing promises to settle
      await Promise.allSettled(processingPromises);
      console.log(`[${new Date().toISOString()}] Finished processing all bets for round ${completedRoundId}.`);

      // 4. Prepare for the next round
      const nextRoundId = `R${Date.now()}`;
      const nextRoundTimeLeft = timerDuration; // Reset timer for the new round

      // 5. Emit completion event to ALL connected clients (Task 4)
      io.emit("roundCompleted", {
        previousRoundId: completedRoundId,
        result: randomNumberResult, // Send the winning number (0-9)
        resultColor: resultColorName, // Send the winning color name (optional)
        message: `Round ${completedRoundId.slice(-6)} ended. Result: ${randomNumberResult}. New round ${nextRoundId.slice(-6)} starting!`, // User-friendly message
        nextRoundId: nextRoundId,
        nextRoundTimeLeft: nextRoundTimeLeft,
      });
      console.log(`[${new Date().toISOString()}] Emitted 'roundCompleted' for ${completedRoundId}. Starting new round ${nextRoundId}.`);

      // Update server state for the new round *after* emitting results
      currentRoundId = nextRoundId;
      timeLeft = nextRoundTimeLeft;

      // Update app.locals game state with the new round
      app.locals.gameState = {
        currentRoundId,
        timeLeft,
        timerDuration,
      };

    } catch (roundError) {
      console.error(`[${new Date().toISOString()}] CRITICAL ERROR processing round ${completedRoundId}:`, roundError);
      // Attempt to recover by starting a new round anyway, but log the error critically
      const nextRoundId = `R${Date.now()}`;
      const nextRoundTimeLeft = timerDuration;
      io.emit("roundCompleted", { // Emit completion but indicate error
        previousRoundId: completedRoundId,
        result: null, resultColor: null, // Indicate result processing failed
        message: `Error processing round ${completedRoundId.slice(-6)}. New round ${nextRoundId.slice(-6)} started. Please report if issues persist.`,
        nextRoundId: nextRoundId, nextRoundTimeLeft: nextRoundTimeLeft,
      });
      currentRoundId = nextRoundId;
      timeLeft = nextRoundTimeLeft;
      console.log(`[${new Date().toISOString()}] Error recovery initiated: Starting new round ${currentRoundId}.`);

      // Update app.locals game state in the error recovery case too
      app.locals.gameState = {
        currentRoundId,
        timeLeft,
        timerDuration,
      };

    } finally {
      isProcessingResults = false; // UNLOCK processing for the next cycle
      console.log(`[${new Date().toISOString()}] Result processing unlocked.`);
    }
  } // End of timer ended block
}; // End of runGameCycle function

// --- Start the Game Timer Loop ---
const startUniversalTimer = () => {
  if (gameTimerInterval) {
    clearInterval(gameTimerInterval); // Clear existing timer if any (e.g., on restart)
    console.log(`[${new Date().toISOString()}] Cleared existing game timer interval.`);
  }
  console.log(`[${new Date().toISOString()}] Starting universal game timer. Initial Round: ${currentRoundId}, Duration: ${timerDuration}s`);
  // Run the cycle immediately once to start the first round countdown, then set the interval
  runGameCycle();
  gameTimerInterval = setInterval(runGameCycle, 1000); // Run the cycle every second
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id} from ${socket.handshake.address}`);

  // Send the current game state immediately to the newly connected client
  socket.emit("timerUpdate", { timeLeft, roundId: currentRoundId });
  console.log(`[${new Date().toISOString()}] Sent initial timer state to ${socket.id}: Round ${currentRoundId}, Time Left ${timeLeft}`);

  // Update app.locals game state
  app.locals.gameState = {
    currentRoundId,
    timeLeft,
    timerDuration,
  };

  // Handle client disconnection
  socket.on('disconnect', (reason) => {
    console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}, Reason: ${reason}`);
  });

  // Handle potential errors from the client side socket
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error from ${socket.id}:`, error);
  });

});

// --- Middleware for attaching io ---
app.use((req, res, next) => {
  req.io = io;
  next();
});

// --- Start the Timer ---
startUniversalTimer();

// --- 404 Not Found Handler ---
// Should be after all API routes
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.originalUrl}` });
});


// --- Global Error Handler Middleware ---
// Should be the last middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Global Error Handler caught error for ${req.method} ${req.originalUrl}:`, err.stack);
  // Avoid sending detailed errors in production
  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'An unexpected error occurred on the server.'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: message,
    // Optionally include stack trace in development only
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// --- Start HTTP Server ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`));

// --- Graceful Shutdown Handling ---
const gracefulShutdown = (signal) => {
  console.log(`\n[${new Date().toISOString()}] ${signal} received. Shutting down gracefully...`);
  clearInterval(gameTimerInterval); // Stop the game timer loop

  console.log(`[${new Date().toISOString()}] Closing Socket.IO server...`);
  io.close(() => {
    console.log(`[${new Date().toISOString()}] Socket.IO server closed.`);

    console.log(`[${new Date().toISOString()}] Closing MongoDB connection...`);
    mongoose.connection.close(false, () => { // false = don't force close immediately
      console.log(`[${new Date().toISOString()}] MongoDB connection closed.`);

      console.log(`[${new Date().toISOString()}] Closing HTTP server...`);
      server.close(() => {
        console.log(`[${new Date().toISOString()}] HTTP server closed.`);
        process.exit(0); // Exit process
      });
    });
  });

  // Force shutdown if graceful fails after a timeout
  setTimeout(() => {
    console.error(`[${new Date().toISOString()}] Could not close connections gracefully in time, forcing shutdown.`);
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill command

module.exports = app; // Export app if needed for testing frameworks