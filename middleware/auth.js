const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware to check if the user is authenticated
const isAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1]; // Extract token from the Authorization header
        if (!token) {
            return res.status(401).json({ message: "No token provided. Access denied." });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
        const user = await User.findById(decoded.id); // Find the user by ID from the token
        if (!user) {
            return res.status(404).json({ message: "User not found. Access denied." });
        }

        req.user = user; // Attach the user object to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error("Error in isAuth middleware:", error.message);
        res.status(401).json({ message: "Invalid token. Access denied." });
    }
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Access denied. Admins only." });
        }
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error("Error in isAdmin middleware:", error.message);
        res.status(500).json({ message: "Server error." });
    }
};

module.exports = { isAuth, isAdmin };
