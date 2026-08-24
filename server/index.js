/**
 * @module Server
 *
 * Entry point for the Hunting Lodge API server.
 * Handles environment configuration, database connection, middleware setup,
 * and route registration for all application features.
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const mongoose = require("mongoose");
const config = require("./config");
const authRoutes = require("./routes/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// Configure reverse proxy trust for correct client IP resolution behind proxies (Nginx, ALB, Cloudflare)
app.set("trust proxy", config.security.trustProxy);

// Global Middleware setup
app.use(morgan(config.logging.morganFormat)); // HTTP request logger (dev vs combined)
app.use(helmet()); // Secure HTTP headers

// CORS configuration (Permissive in Dev, restricted in Prod if configured)
if (config.security.corsOrigin === true) {
    app.use(cors());
} else if (config.security.corsOrigin) {
    app.use(cors({ origin: config.security.corsOrigin, credentials: true }));
} else {
    app.use(cors());
}

app.use(express.json());

// Apply rate limiting to all requests based on environment configuration
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use(limiter);

/**
 * Establishes a connection to the MongoDB database using the URI provided in configuration.
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
        const conn = await mongoose.connect(config.mongoUri);
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

// === Centralized Error Handling & Fallback 404 Middleware ===
app.use(notFoundHandler);
app.use(errorHandler);

// Start listening for incoming requests
app.listen(config.port, () => {
    console.log(`🚀 Server is running on port ${config.port} [Environment: ${config.env}]`);
});
