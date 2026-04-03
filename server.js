const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/mongodb.js');
const connectCloudinary = require('./config/cloudinary.js');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

connectDB();
connectCloudinary();

const userRoutes = require('./routes/userRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use("/api/users", userRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/admin", adminRoutes);

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Unified Server has started on http://localhost:${port}/api`);
});
