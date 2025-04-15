const { colorModels } = require('../models/ColorModel');
const User = require('../models/User');
// const User_Wallet = require('../\');


// Create a new game entry (Place Bet)
exports.placeBet = async (req, res, next) => {
    console.log(`[${new Date().toISOString()}] Received POST /api/color/place-bet`);
    console.log(`[${new Date().toISOString()}] Request Body:`, JSON.stringify(req.body));

    // --- Get data from request body ---
    const { amount, selectedNumber, roundId: requestRoundId, user: userId } = req.body;

    // --- Get game state from middleware (req.gameState) ---
    // Check if middleware attached the state (it should have)
    if (!req.gameState) {
        console.error(`[${new Date().toISOString()}] CRITICAL: req.gameState not found. Middleware issue?`);
        return next(new Error("Internal server error: Game state missing.")); // Use error handler
    }
    const { currentRoundId: serverCurrentRoundId, timeLeft: serverTimeLeft, isBettingAllowed: serverBettingAllowed } = req.gameState;
    console.log(`[${new Date().toISOString()}] State from Middleware: Round=${serverCurrentRoundId}, TimeLeft=${serverTimeLeft}, BettingAllowed=${serverBettingAllowed}`);

    try {
        // --- 1. Basic Input Validation ---
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            console.error(`[${new Date().toISOString()}] Validation Failed: Invalid amount - ${amount}`);
            return res.status(400).json({ success: false, message: 'Invalid bet amount provided.' });
        }
        if (selectedNumber === null || selectedNumber === undefined) {
            console.error(`[${new Date().toISOString()}] Validation Failed: Missing selectedNumber.`);
            return res.status(400).json({ success: false, message: 'No color or number selected.' });
        }
        if (!requestRoundId || typeof requestRoundId !== 'string') {
            console.error(`[${new Date().toISOString()}] Validation Failed: Invalid roundId - ${requestRoundId}`);
            return res.status(400).json({ success: false, message: 'Invalid round ID.' });
        }
        if (!userId || typeof userId !== 'string') {
            console.error(`[${new Date().toISOString()}] Validation Failed: Invalid userId - ${userId}`);
            return res.status(400).json({ success: false, message: 'Invalid user ID.' });
        }
        console.log(`[${new Date().toISOString()}] Basic validation passed.`);

        // --- 2. Game State Validation ---
        // Use the variables derived from req.gameState
        console.log(`[${new Date().toISOString()}] Comparing Rounds: Request=${requestRoundId}, Server=${serverCurrentRoundId}`);
        if (requestRoundId !== serverCurrentRoundId) {
            console.error(`[${new Date().toISOString()}] Validation Failed: Round ID mismatch. Request: ${requestRoundId}, Server: ${serverCurrentRoundId}`);
            // Give a user-friendly round ID if possible
            const displayServerRoundId = serverCurrentRoundId ? serverCurrentRoundId.slice(-6) : 'current';
            return res.status(400).json({ success: false, message: `Betting is only allowed for the ${displayServerRoundId} round. Please wait.` });
        }
        if (!serverBettingAllowed) {
            console.error(`[${new Date().toISOString()}] Validation Failed: Betting is closed for round ${serverCurrentRoundId}. Time Left: ${serverTimeLeft}`);
            return res.status(400).json({ success: false, message: 'Betting is currently closed for this round.' });
        }
        console.log(`[${new Date().toISOString()}] Game state validation passed.`);

        // --- 3. User Validation ---
        const user = await User.findById(userId);
        if (!user) {
            console.error(`[${new Date().toISOString()}] Validation Failed: User not found - ${userId}`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        console.log(`[${new Date().toISOString()}] User ${userId} found. Wallet Balance: ${user.wallet}`);

        // --- 3.5. Check if user already placed a bet on this selection ---
        const existingBet = await colorModels.findOne({
            user: userId,
            roundId: requestRoundId,
            predictedColor: selectedNumber
        });

        if (existingBet) {
            console.log(`[${new Date().toISOString()}] User ${userId} already placed a bet on ${selectedNumber} for round ${requestRoundId}.`);
            // Allow placing multiple bets on different selections, but not the same selection
            return res.status(400).json({
                success: false,
                message: `You already placed a bet on ${selectedNumber} for this round. Try a different selection.`
            });
        }

        if (user.wallet < amount) {
            console.error(`[${new Date().toISOString()}] Validation Failed: Insufficient balance for user ${userId}. Needed: ${amount}, Has: ${user.wallet}`);
            return res.status(400).json({ success: false, message: `Insufficient balance. You need ₹${amount.toFixed(2)} but have ₹${user.wallet.toFixed(2)}.` });
        }
        console.log(`[${new Date().toISOString()}] User balance check passed.`);

        // --- 4. Perform Bet Placement (Update Wallet & Create Record) ---
        const originalBalance = user.wallet;
        user.wallet -= amount;
        await user.save();
        console.log(`[${new Date().toISOString()}] User ${userId} wallet updated: ${originalBalance.toFixed(2)} -> ${user.wallet.toFixed(2)}`);

        const newBet = new colorModels({
            user: userId,
            roundId: requestRoundId,
            betAmout: amount,
            predictedColor: selectedNumber,
            walletBalance: user.wallet,
            isWin: 'Pending',
            winAmt: 0,
            createdAt: new Date()
        });
        await newBet.save();
        console.log(`[${new Date().toISOString()}] Bet record created: ${newBet._id} for round ${requestRoundId}`);

        // --- 5. Success Response ---
        res.status(201).json({
            success: true,
            message: 'Bet placed successfully!',
            bet: {
                id: newBet._id,
                roundId: newBet.roundId.slice(-6), // Send short ID back
                amount: newBet.betAmout,
                selection: newBet.predictedColor,
            },
            newBalance: user.wallet.toFixed(2),
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] CRITICAL ERROR in placeBet controller for user ${userId || 'UNKNOWN'}:`, error);
        next(error); // Pass to global error handler
    }
};


const generateRandomResult = () => {
    const colors = ["green", "violet", "red"];
    const numbers = Array.from({ length: 9 }, (_, i) => i + 1); // Numbers 1 to 9
    const allResults = [...colors, ...numbers]; // Combine colors and numbers
    const randomIndex = Math.floor(Math.random() * allResults.length); // Random index
    return allResults[randomIndex]; // Return a random result
};

let isProcessingResults = false; // Flag to prevent overlapping result processing

exports.processResult = async (req, res) => {
    try {
        const { roundId } = req.params;
        const randomResult = Math.floor(Math.random() * 10); // Generate random number 0-9

        // Save the result
        const result = await colorModels.create({
            roundId,
            randomNumber: randomResult,
            createdAt: new Date()
        });

        // Update all bets for this round
        const bets = await colorModels.find({ roundId });
        for (const bet of bets) {
            const isWin = bet.predictedColor === randomResult;
            const winAmount = isWin
                ? (bet.predictedColor === 0 ? bet.betAmout * 3 : bet.betAmout * 2)
                : bet.betAmout * 0.05;

            await colorModels.findByIdAndUpdate(bet._id, {
                resultColor: randomResult,
                status: isWin ? 'won' : 'lost',
                winAmt: winAmount
            });

            // Update user's wallet
            await User.findByIdAndUpdate(bet.user, {
                $inc: { wallet: winAmount }
            });
        }

        // Emit socket event for the result
        req.io.emit("gameResult", {
            roundId,
            randomResult,
            message: "Round result declared!"
        });

        res.status(200).json({
            success: true,
            message: 'Result processed successfully',
            randomResult
        });
    } catch (error) {
        console.error('Error processing result:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing result',
            error: error.message
        });
    }
};

// Fetch game history
exports.getHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await colorModels.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching history',
            error: error.message
        });
    }
};

// Get all history with results
exports.getallHistory = async (req, res) => {
    try {
        // First get system-generated results (standalone results)
        const systemResults = await colorModels.find({ isSystemGenerated: true })
            .sort({ createdAt: -1 })
            .limit(20); // Get more than we need to ensure we have enough unique results

        // If we don't have enough system results, also get results from bet records
        const betResults = await colorModels.find({
            isSystemGenerated: { $ne: true },
            resultColor: { $exists: true, $ne: null }
        })
            .sort({ createdAt: -1 })
            .limit(30);

        // Combine all results and remove duplicates by roundId
        const allResults = [...systemResults, ...betResults];

        // Use a Map to deduplicate by roundId, keeping the first occurrence
        const resultsByRound = new Map();
        allResults.forEach(result => {
            if (result.roundId && result.resultColor && !resultsByRound.has(result.roundId)) {
                resultsByRound.set(result.roundId, {
                    roundId: result.roundId,
                    result: result.resultColor,
                    color: typeof result.resultColor === 'string' && !isNaN(parseInt(result.resultColor))
                        ? getColorForNumber(parseInt(result.resultColor))
                        : null,
                    createdAt: result.createdAt
                });
            }
        });

        // Convert to array, sort by creation date, and take only the last 10
        const uniqueResults = Array.from(resultsByRound.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        console.log(`[${new Date().toISOString()}] Returning ${uniqueResults.length} unique results`);
        res.status(200).json(uniqueResults);
    } catch (error) {
        console.error('Error fetching all history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching all history',
            error: error.message
        });
    }
};

// Helper function to determine color based on number
function getColorForNumber(number) {
    if (number === 0 || number === 5) return 'violet';
    if (number % 2 === 0) return 'red'; // Even numbers (2, 4, 6, 8)
    return 'green'; // Odd numbers (1, 3, 7, 9)
}

// exports.fetchWalletBalance = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const game = await colorModels.findById(id);
//         if (!game) return res.status(404).json({ message: "Game not found" });
//         res.json({ walletBalance: game.walletBalance });
//     } catch (error) {
//         console.error("Error fetching wallet balance:", error);
//         res.status(500).json({ error: error.message });
//     }
// };

exports.resetAll = async (req, res) => {
    try {
        await colorModels.deleteMany({});
        res.json({ message: 'All matches have been reset' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};