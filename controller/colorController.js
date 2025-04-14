const { colorModels } = require('../models/ColorModel');
const User = require('../models/User');
// const User_Wallet = require('../\');
// Create a new game entry (Place Bet)
exports.placeBet = async (req, res) => {
    try {
        const { amount, walletBalance, selectedNumber, newRoundId, user, referalId } = req.body;

        // Validate required fields
        if (!amount || !selectedNumber || !newRoundId || !user) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const existuser = await User.findOne({ _id: user });
        if (!existuser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if the user has sufficient balance
        if (amount > existuser.wallet) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Deduct the bet amount from the user's wallet
        existuser.wallet -= amount;
        await existuser.save();

        // Create a new bet entry
        const newEntry = new colorModels({
            roundId: newRoundId,
            walletBalance: existuser.wallet,
            betAmout: amount,
            predictedColor: selectedNumber,
            resultColor: null,
            winAmt: 0,
            user,
            referalId: referalId || null,
        });

        await newEntry.save();
        res.status(201).json({ success: true, message: "Bet Placed!", data: newEntry });
    } catch (error) {
        console.error("Error placing bet:", error);
        res.status(500).json({ message: "Failed to place bet", error: error.message });
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
        if (isProcessingResults) {
            return res.status(400).json({ message: "Results are already being processed" });
        }

        isProcessingResults = true; // Set the flag to true
        const { roundId } = req.params;

        if (!roundId) {
            isProcessingResults = false; // Reset the flag
            console.error("Error: roundId is missing");
            return res.status(400).json({ message: "roundId is required" });
        }

        const randomResult = generateRandomResult(); // Generate a random result
        console.log(`Processing results for roundId: ${roundId}, randomResult: ${randomResult}`);

        const games = await colorModels.find({ roundId });

        if (!games || games.length === 0) {
            isProcessingResults = false; // Reset the flag
            console.warn(`No bets found for roundId: ${roundId}`);
            return res.status(404).json({ message: "No bets found for this round" });
        }

        for (const game of games) {
            const user = await User.findOne({ _id: game.user });
            if (!user) {
                console.warn(`User not found for userId: ${game.user}`);
                continue;
            }

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

        // Broadcast the result to all connected clients
        req.io.emit("gameResult", { roundId, randomResult });

        isProcessingResults = false; // Reset the flag
        res.status(200).json({ success: true, message: "Results processed", randomResult });
    } catch (error) {
        isProcessingResults = false; // Reset the flag in case of error
        console.error("Error processing result:", error.message, error.stack);
        res.status(500).json({ error: "An error occurred while processing the result" });
    }
};

// Fetch game history
exports.getHistory = async (req, res) => {
    try {
        const { userId } = req.params
        const history = await colorModels.find({ user: userId }).sort({ createdAt: -1 })
        res.json(history);
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: error.message });
    }
};
exports.getallHistory = async (req, res) => {
    try {
        // const { userId } = req.params
        const history = await colorModels.find().sort({ createdAt: -1 })
        res.json(history);
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: error.message });
    }
};


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