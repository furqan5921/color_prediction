const { randomcolorModels } = require('../models/SelectColorModel');

// Get All Random Numbers
const getAllRandomNumbers = async (req, res) => {
    try {
        const numbers = await randomcolorModels.find().sort({ createdAt: -1 });
        res.status(200).json(numbers);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
const getLastRoundId = async (req, res) => {
    try {
        const roundId = await randomcolorModels.findOne().sort({ createdAt: -1 });
        if (!roundId) {
            const randomNumber = Math.floor(Math.random() * 10);
            const newRound = new randomcolorModels({
                roundId: `R${Date.now()}`,
                randomNumber: randomNumber,
                createdAt: new Date()
            });
            await newRound.save();
            return res.status(200).json(newRound);
        }
        res.status(200).json(roundId);
    } catch (error) {
        console.error("Error in getLastRoundId:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
// Get All Random Numbers
const getRandomNumberById = async (req, res) => {
    try {
        const { roundId } = req.params;
        let numbers = await randomcolorModels.findOne({ roundId: roundId });
        if (!numbers) {
            const randomNumber = Math.floor(Math.random() * 10);
            numbers = { roundId: roundId, randomNumber: randomNumber };
        }
        res.status(200).json(numbers);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Add New Random Number
const addRandomNumber = async (req, res) => {
    try {
        const { roundId, randomNumber } = req.body;
        const newRandom = new randomcolorModels({
            roundId,
            randomNumber,
            createdAt: new Date() // Add timestamp
        });
        await newRandom.save();
        res.status(201).json({
            message: 'Random number added successfully',
            result: newRandom
        });
    } catch (error) {
        console.error("Error adding random number:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete Random Number by Round ID
const deleteRandomNumber = async (req, res) => {
    try {
        const { roundId } = req.params;
        const deleted = await randomcolorModels.findOneAndDelete({ roundId });

        if (!deleted) {
            return res.status(404).json({ message: "Random number not found" });
        }

        res.status(200).json({ message: "Random number deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { getAllRandomNumbers, addRandomNumber, getRandomNumberById, deleteRandomNumber, getLastRoundId };
