const express = require('express');
const router = express.Router();
const colorController = require('../controller/colorController');
const { getAllRandomNumbers, addRandomNumber, getRandomNumberById, deleteRandomNumber, getLastRoundId } = require('../controller/selectColorCOntroller');
const { deleteReferralCode, getAllReferralCodes, addReferralCode } = require('../controller/referalCodeController');
const gameStateMiddleware = require('../middleware/gameStateMiddleware');
const Deposit = require('../models/Deposit');
const { colorModels } = require('../models/ColorModel');
const User = require('../models/User');
const AdminDeclaredResult = require('../models/AdminDeclaredResult');

// Game routes
router.get('/current-state', (req, res) => {
    try {
        // Get the current game state from app.locals
        const gameState = req.app.locals.gameState || {
            currentRoundId: null,
            timeLeft: 0,
            timerDuration: 180
        };

        // Return the game state
        return res.status(200).json({
            success: true,
            ...gameState
        });
    } catch (error) {
        console.error('Error getting current game state:', error);
        return res.status(500).json({
            success: false,
            message: 'Error retrieving game state',
            error: error.message
        });
    }
});
router.post('/place-bet', gameStateMiddleware, colorController.placeBet);  // Place a bet
router.put('/process-result/:roundId', colorController.processResult); // Process result
router.get('/history/:userId', colorController.getHistory);  // Get game history
router.get('/history-all', colorController.getallHistory);  // Get game history
// router.get('/wallet-balance', colorController.fetchWalletBalance);  // Get game history
router.delete('/reset-game', colorController.resetAll);  // Get game history

// Result routes
router.get('/get-random-color', getAllRandomNumbers)
router.post('/select-random-color', addRandomNumber)
router.get('/get-random-color-by-id/:roundId', getRandomNumberById)
router.delete('/delete-random-color/:roundId', deleteRandomNumber)
router.get('/get-lastRoundId', getLastRoundId)

// Referral routes
router.get('/get-referal-code', getAllReferralCodes)
router.post('/add-referal-code', addReferralCode)
// router.get('/get-random-color-by-id/:roundId', getRandomNumberById)
router.delete('/delete-referal-code/:id', deleteReferralCode)

// Admin route to manually set game result
router.post('/admin/set-result', async (req, res) => {
    try {
        const { result, color, roundId } = req.body;

        if (!roundId || (result === undefined && !color)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: roundId and either result or color'
            });
        }

        // Validate if the provided roundId matches the current round and if it's still ongoing
        const { currentRoundId, timeLeft } = req.app.locals.gameState || {};

        if (roundId !== currentRoundId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid round ID or round already completed'
            });
        }

        // Validate color if provided
        if (color && !['red', 'green', 'violet'].includes(color.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid color. Must be red, green, or violet.'
            });
        }

        // Set the result number and color - prioritize admin's exact selections
        let randomResult;
        let finalColorName;

        // CASE 1: Admin provided both number and color
        if (result !== undefined && !isNaN(parseInt(result)) && color) {
            randomResult = parseInt(result);
            finalColorName = color.toLowerCase();

            // Log the admin's choice, even if inconsistent with game rules
            const standardColor = randomResult === 0 || randomResult === 5 ? 'violet' :
                randomResult % 2 === 0 ? 'red' : 'green';

            if (finalColorName !== standardColor) {
                console.log(`INFO: Admin set non-standard combination - number ${randomResult} with color ${finalColorName} (standard would be ${standardColor})`);
            } else {
                console.log(`INFO: Admin set standard combination - number ${randomResult} with color ${finalColorName}`);
            }
        }
        // CASE 2: Admin provided only number
        else if (result !== undefined && !isNaN(parseInt(result))) {
            randomResult = parseInt(result);

            // If no color specified, use the standard mapping
            finalColorName = randomResult === 0 || randomResult === 5 ? 'violet' :
                randomResult % 2 === 0 ? 'red' : 'green';

            console.log(`INFO: Admin set only number ${randomResult}, using standard color ${finalColorName}`);
        }
        // CASE 3: Admin provided only color
        else if (color) {
            finalColorName = color.toLowerCase();

            // Generate a random number that matches the specified color
            switch (finalColorName) {
                case 'violet':
                    randomResult = Math.random() < 0.5 ? 0 : 5;
                    break;
                case 'red':
                    randomResult = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
                    break;
                case 'green':
                    randomResult = [1, 3, 7, 9][Math.floor(Math.random() * 4)];
                    break;
                default:
                    randomResult = Math.floor(Math.random() * 10);
            }

            console.log(`INFO: Admin set only color ${finalColorName}, generated matching number ${randomResult}`);
        }
        // CASE 4: Fallback (shouldn't reach here due to validation above)
        else {
            randomResult = Math.floor(Math.random() * 10);
            finalColorName = randomResult === 0 || randomResult === 5 ? 'violet' :
                randomResult % 2 === 0 ? 'red' : 'green';

            console.log(`WARNING: No valid input provided, generated random number ${randomResult} and color ${finalColorName}`);
        }

        // Update game state
        req.app.locals.gameState.timeLeft = 0; // Force timer to end

        // Store result in database
        await colorModels.create({
            roundId,
            resultColor: String(randomResult),
            createdAt: new Date(),
            isSystemGenerated: true,
            isAdminSet: true, // Flag to indicate admin manually set this result
            predictedColor: null,
            betAmout: 0,
            user: null
        });

        // Process bets immediately
        const bets = await colorModels.find({ roundId });

        // Process each bet
        for (const bet of bets) {
            let isWinner = false;
            let winAmount = 0;

            // Determine if bet is a winner based on number or color
            const predictedValue = bet.predictedColor;

            // Check if bet on specific number
            if (!isNaN(parseInt(predictedValue)) && parseInt(predictedValue) === randomResult) {
                isWinner = true;
                winAmount = bet.betAmout * (randomResult === 0 ? 3 : 2);
            }
            // Check if bet on color
            else if (['green', 'red', 'violet'].includes(predictedValue) &&
                predictedValue === finalColorName) {
                isWinner = true;
                winAmount = bet.betAmout * 2;
            } else {
                // Loss, but get 5% refund
                winAmount = bet.betAmout * 0.05;
            }

            // Update bet record
            await colorModels.findByIdAndUpdate(bet._id, {
                resultColor: randomResult,
                isWin: isWinner ? 'Won' : 'Lost',
                winAmt: winAmount
            });

            // Update user wallet
            if (bet.user) {
                await User.findByIdAndUpdate(bet.user, {
                    $inc: { wallet: winAmount }
                });
            }
        }

        // Emit socket events
        if (req.app.io) {
            // First emit gameResult
            req.app.io.emit("gameResult", {
                roundId,
                randomResult,
                message: "Round result declared by admin!"
            });

            // Then emit timer ended
            req.app.io.emit("timerEnded", {
                roundId,
                message: "Processing results..."
            });

            // Prepare for next round
            const nextRoundId = `R${Date.now()}`;
            const timerDuration = req.app.locals.gameState.timerDuration || 180;

            // Finally emit round completed
            setTimeout(() => {
                req.app.io.emit("roundCompleted", {
                    previousRoundId: roundId,
                    result: randomResult,
                    resultColor: finalColorName,
                    message: `Round ${roundId.slice(-6)} ended. Result: ${randomResult}. New round ${nextRoundId.slice(-6)} starting!`,
                    nextRoundId: nextRoundId,
                    nextRoundTimeLeft: timerDuration,
                });

                // Update server state
                req.app.locals.gameState = {
                    currentRoundId: nextRoundId,
                    timeLeft: timerDuration,
                    timerDuration
                };

            }, 2000); // Short delay to ensure timerEnded is processed
        }

        res.status(200).json({
            success: true,
            message: 'Game result set successfully',
            roundId,
            result: randomResult,
            color: finalColorName
        });

    } catch (error) {
        console.error('Error setting game result:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting game result',
            error: error.message
        });
    }
});

// Admin route to declare a result for the current game (without ending it)
router.post('/admin/declare-result', async (req, res) => {
    try {
        const { result, color, roundId } = req.body;

        if (!roundId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: roundId'
            });
        }

        // Require either color or result (or both)
        if (result === undefined && color === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Must provide either a number (0-9) or a color (red/green/violet)'
            });
        }

        // Validate number if provided
        let resultNumber;
        if (result !== undefined) {
            if (isNaN(parseInt(result)) || parseInt(result) < 0 || parseInt(result) > 9) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid result number. Must be between 0-9'
                });
            }
            resultNumber = parseInt(result);
        }

        // Validate color if provided
        if (color && !['red', 'green', 'violet'].includes(color.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid color. Must be red, green, or violet.'
            });
        }

        // Validate if the provided roundId matches the current round
        const { currentRoundId } = req.app.locals.gameState || {};

        if (roundId !== currentRoundId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid round ID - can only declare results for the current active round'
            });
        }

        // Check if a result has already been declared for this round
        const existingResult = await AdminDeclaredResult.findOne({ roundId });
        if (existingResult) {
            return res.status(400).json({
                success: false,
                message: `A result has already been declared for round ${roundId}`,
                existingResult: {
                    resultNumber: existingResult.resultNumber,
                    resultColor: existingResult.resultColor,
                    declaredAt: existingResult.declaredAt
                }
            });
        }

        // Determine both number and color, handling all cases
        let finalResultNumber;
        let finalResultColor;

        // CASE 1: Both number and color specified
        if (resultNumber !== undefined && color) {
            finalResultNumber = resultNumber;
            finalResultColor = color.toLowerCase();

            // Check if this is a standard or non-standard combination
            const standardColor = resultNumber === 0 || resultNumber === 5 ? 'violet' :
                resultNumber % 2 === 0 ? 'red' : 'green';

            if (finalResultColor !== standardColor) {
                console.log(`INFO: Admin declared non-standard combination - number ${finalResultNumber} with color ${finalResultColor} (standard would be ${standardColor})`);
            } else {
                console.log(`INFO: Admin declared standard combination - number ${finalResultNumber} with color ${finalResultColor}`);
            }
        }
        // CASE 2: Only number specified
        else if (resultNumber !== undefined) {
            finalResultNumber = resultNumber;

            // Use standard color for this number
            if (resultNumber === 0 || resultNumber === 5) {
                finalResultColor = 'violet';
            } else if (resultNumber % 2 === 0) { // 2, 4, 6, 8
                finalResultColor = 'red';
            } else { // 1, 3, 7, 9
                finalResultColor = 'green';
            }

            console.log(`INFO: Admin declared only number ${finalResultNumber}, using standard color ${finalResultColor}`);
        }
        // CASE 3: Only color specified
        else if (color) {
            finalResultColor = color.toLowerCase();

            // Generate an appropriate number for this color
            switch (finalResultColor) {
                case 'violet':
                    finalResultNumber = Math.random() < 0.5 ? 0 : 5;
                    break;
                case 'red':
                    finalResultNumber = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
                    break;
                case 'green':
                    finalResultNumber = [1, 3, 7, 9][Math.floor(Math.random() * 4)];
                    break;
                default:
                    finalResultNumber = Math.floor(Math.random() * 10);
            }

            console.log(`INFO: Admin declared only color ${finalResultColor}, selected matching number ${finalResultNumber}`);
        }

        // Create the new admin-declared result
        const adminResult = new AdminDeclaredResult({
            roundId,
            resultNumber: finalResultNumber,
            resultColor: finalResultColor,
            declaredAt: new Date(),
            isApplied: false
        });

        await adminResult.save();

        console.log(`Admin declared result for round ${roundId}: ${finalResultNumber} (${finalResultColor})`);

        res.status(201).json({
            success: true,
            message: `Result declared for round ${roundId}`,
            result: {
                roundId,
                resultNumber: finalResultNumber,
                resultColor: finalResultColor
            }
        });

    } catch (error) {
        console.error('Error declaring game result:', error);
        res.status(500).json({
            success: false,
            message: 'Error declaring game result',
            error: error.message
        });
    }
});

// Admin route to get declared result for a round
router.get('/admin/declared-result/:roundId', async (req, res) => {
    try {
        const { roundId } = req.params;

        if (!roundId) {
            return res.status(400).json({
                success: false,
                message: 'Missing round ID'
            });
        }

        const result = await AdminDeclaredResult.findOne({ roundId });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: `No declared result found for round ${roundId}`
            });
        }

        return res.status(200).json({
            success: true,
            result: {
                roundId: result.roundId,
                resultNumber: result.resultNumber,
                resultColor: result.resultColor,
                declaredAt: result.declaredAt,
                isApplied: result.isApplied,
                appliedAt: result.appliedAt
            }
        });
    } catch (error) {
        console.error(`Error fetching declared result for round ${req.params.roundId}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching declared result',
            error: error.message
        });
    }
});

module.exports = router;
