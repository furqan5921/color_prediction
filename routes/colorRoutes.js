const express = require('express');
const router = express.Router();
const colorController = require('../controller/colorController');
const { getAllRandomNumbers, addRandomNumber, getRandomNumberById, deleteRandomNumber, getLastRoundId } = require('../controller/selectColorCOntroller');
const { deleteReferralCode, getAllReferralCodes, addReferralCode } = require('../controller/referalCodeController');

router.post('/place-bet', colorController.placeBet);  // Place a bet
router.put('/process-result/:roundId', colorController.processResult); // Process result
router.get('/history/:userId', colorController.getHistory);  // Get game history
router.get('/history-all', colorController.getallHistory);  // Get game history
// router.get('/wallet-balance', colorController.fetchWalletBalance);  // Get game history
router.delete('/reset-game', colorController.resetAll);  // Get game history

router.get('/get-random-color', getAllRandomNumbers)
router.post('/select-random-color', addRandomNumber)
router.get('/get-random-color-by-id/:roundId', getRandomNumberById)
router.delete('/delete-random-color/:roundId', deleteRandomNumber)
router.get('/get-lastRoundId', getLastRoundId)

router.get('/get-referal-code', getAllReferralCodes)
router.post('/add-referal-code', addReferralCode)
// router.get('/get-random-color-by-id/:roundId', getRandomNumberById)
router.delete('/delete-referal-code/:id', deleteReferralCode)


module.exports = router;
