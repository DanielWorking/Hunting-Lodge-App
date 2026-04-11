/**
 * @module Server
 *
 * Entry point for the Hunting Lodge API server.
 * Handles environment configuration, database connection, middleware setup,
 * and route registration for all application features.
 */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");

// Load environment variables from .env file
const result = dotenv.config();
if (result.error) {
    console.log("❌ Error loading .env file", result.error);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware setup
app.use(cors());
app.use(express.json());

/**
 * Establishes a connection to the MongoDB database using the URI provided in environment variables.
 *
 * Terminates the process with an error code if the connection fails, as the application
 * cannot function without a database.
 *
 * @async
 * @function connectDB
 * @throws {Error} If the connection to MongoDB fails.
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

// Initialize database connection
connectDB();

// Initialize background tasks (Cron Jobs)
require("./services/cronJobs");

// === API Route Definitions ===
app.use("/api/sites", require("./routes/sites"));
app.use("/api/phones", require("./routes/phones"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/users", require("./routes/users"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/reports", require("./routes/reports"));

// SSO Authentication Routes
app.use("/api/auth", authRoutes);

/**
 * Root health check endpoint.
 *
 * @name GET /
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
app.get("/", (req, res) => {
    res.send("Hunting Lodge API is running...");
});

// Start listening for incoming requests
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
