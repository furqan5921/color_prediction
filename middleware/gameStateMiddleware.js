// Game state middleware to share the current game state with route handlers
// This middleware attaches current game state to all requests

const gameStateMiddleware = (req, res, next) => {
    // Access the game state from the global scope in index.js
    // These variables are defined in the global scope of index.js
    try {
        // Get references to the global variables from index.js
        const { currentRoundId, timeLeft, timerDuration } = req.app.locals.gameState || {};

        // Calculate whether betting is allowed (typically if enough time is left)
        const isBettingAllowed = timeLeft > 10; // Allow betting if more than 10 seconds left

        // Attach the game state to the request object
        req.gameState = {
            currentRoundId,
            timeLeft,
            timerDuration,
            isBettingAllowed
        };

        console.log(`[${new Date().toISOString()}] Game state middleware attached state: Round=${currentRoundId}, TimeLeft=${timeLeft}, BettingAllowed=${isBettingAllowed}`);

        next();
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in gameStateMiddleware:`, error);
        // Still attach empty gameState to prevent undefined errors
        req.gameState = {
            currentRoundId: null,
            timeLeft: 0,
            timerDuration: 180,
            isBettingAllowed: false
        };
        next();
    }
};

module.exports = gameStateMiddleware; 