const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); // Import HTTP module
const { Server } = require('socket.io'); // Import Socket.IO
const authRoutes = require('./routes/auth');
require('dotenv').config();
const adminRoutes = require('./controller/adminController');
const userRoutes = require('./routes/user');
const colorPredictionRoutes = require('./routes/colorRoutes');
const { colorModels } = require('./models/ColorModel'); // Import colorModels
const User = require('./models/User'); // Import User model

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (adjust for production)
    methods: ['GET', 'POST'],
  },
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1); // Exit the application with an error code
  });

// app.use(cors());
app.use(
  cors({
    origin: ["https://kingmills.vercel.app", "http://localhost:5173"], // Allow both production and local development
    methods: ['POST', 'GET', 'PUT', 'DELETE'], // Define allowed HTTP methods
    credentials: true, // Allow credentials like cookies to be sent
  })
);
app.use(express.json());

app.use('/api', authRoutes);
app.use(userRoutes);
app.use('/api/color', colorPredictionRoutes);
app.use('/api', adminRoutes);

// Universal timer variables
let timerDuration = 120; // 3 minutes
let timeLeft = timerDuration; // Remaining time for the current round
let roundId = `R${Date.now().toString()}`; // Unique round ID
let isProcessingResults = false; // Flag to prevent overlapping result processing

const generateRandomResult = () => {
  const colors = ["green", "violet", "red"];
  const numbers = Array.from({ length: 9 }, (_, i) => i + 1); // Numbers 1 to 9
  const allResults = [...colors, ...numbers]; // Combine colors and numbers
  const randomIndex = Math.floor(Math.random() * allResults.length); // Random index
  return allResults[randomIndex]; // Return a random result
};

// Start the universal timer
const startUniversalTimer = () => {
  setInterval(async () => {
    if (timeLeft > 0) {
      timeLeft -= 1;
      io.emit("timerUpdate", { timeLeft, roundId }); // Broadcast timer updates to all clients
    } else {
      if (!isProcessingResults) {
        isProcessingResults = true; // Lock result processing
        io.emit("timerEnded", { roundId }); // Notify clients that the timer has ended

        // Process results for the current round
        try {
          const randomResult = generateRandomResult(); // Generate a random result
          const games = await colorModels.find({ roundId });

          if (games && games.length > 0) {
            for (const game of games) {
              const user = await User.findOne({ _id: game.user });
              if (!user) continue;

              let winAmount = 0;
              let isWinner = false;

              if (game.predictedColor === randomResult) {
                winAmount = game.betAmout * 1.98; // Winning multiplier
                isWinner = true;
                user.wallet += winAmount;
              } else {
                winAmount = game.betAmout * 0.05; // Consolation amount
                user.wallet += winAmount;
              }

              game.resultColor = randomResult;
              game.winAmt = winAmount;
              game.isWin = isWinner ? "Won" : "Lost";
              game.walletBalance = user.wallet;

              await user.save();
              await game.save();
            }

            // Emit the game result to all connected clients
            io.emit("gameResult", {
              roundId,
              randomResult,
              message: "Results have been processed successfully.",
            });
          } else {
            io.emit("gameResult", {
              roundId,
              randomResult: null,
              message: "No bets were placed for this round.",
            });
          }
        } catch (error) {
          console.error("Error processing results:", error);
          io.emit("gameResult", {
            roundId,
            randomResult: null,
            message: "An error occurred while processing results.",
          });
        }

        // Reset for the new round
        timeLeft = timerDuration; // Reset the timer
        roundId = `R${Date.now().toString()}`; // Generate a new round ID
        io.emit("newRound", { roundId, timeLeft }); // Notify clients of the new round
        isProcessingResults = false; // Unlock result processing
      }
    }
  }, 1000); // Update every second
};

io.on('connection', (socket) => {


  // Send the current timer state to the newly connected client
  socket.emit("timerUpdate", { timeLeft, roundId });

  // Broadcast timer updates
  socket.on('timerUpdate', (data) => {
    io.emit('timerUpdate', data); // Broadcast to all clients
  });

  // Broadcast game results
  socket.on('gameResult', (data) => {
    io.emit('gameResult', data); // Broadcast to all clients
  });

  // Broadcast bet placement
  socket.on('betPlaced', (data) => {
    io.emit('betPlaced', data); // Broadcast to all clients
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the universal timer when the server starts
startUniversalTimer();

// Attach Socket.IO to the request object for controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Global error-handling middleware
app.use((err, req, res, next) => {
  console.error('An error occurred:', err.message);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
    },
  });
});

const PORT = process.env.PORT || 8001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
