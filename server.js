const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/mongodb.js');
const connectCloudinary = require('./config/cloudinary.js');

const app = express();

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
const allowAllOrigins = !rawAllowedOrigins || rawAllowedOrigins.trim() === '*';

const allowedOrigins = rawAllowedOrigins
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin && origin !== '*');

const corsOptions = {
  origin: function (origin, callback) {
    if (allowAllOrigins || !origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(cors(corsOptions));

const rateLimiter = require('./middleware/rateLimiter');
app.use(rateLimiter);

const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger);

connectDB();
connectCloudinary();

const userRoutes = require('./routes/userRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const escalationRoutes = require('./routes/escalationRoutes');

app.use("/api/users", userRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", deviceRoutes);
app.use("/api/admin", escalationRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Unified Civic Backend API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      users: "/api/users",
      operator: "/api/operator",
      admin: "/api/admin"
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  console.error(`[ERR ${requestId}] Global error handler:`, err);
  
  if (err.name === "MongoServerError") {
    return res.status(500).json({ success: false, message: "Database operation failed" });
  }
  
  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
  
  res.status(500).json({ success: false, message: err.message });
});

module.exports = app;

if (!process.env.VERCEL) {
  const port = process.env.PORT || 4000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Unified Server has started on http://localhost:${port}/api`);
  });
}
