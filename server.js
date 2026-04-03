const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/mongodb.js');
const connectCloudinary = require('./config/cloudinary.js');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
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

connectDB();
connectCloudinary();

const userRoutes = require('./routes/userRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use("/api/users", userRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  
  if (err.name === "MongoServerError") {
    return res.status(500).json({ success: false, message: "Database operation failed" });
  }
  
  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
  
  res.status(500).json({ success: false, message: err.message });
});

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Unified Server has started on http://localhost:${port}/api`);
});
