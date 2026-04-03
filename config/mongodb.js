const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(`${process.env.MONGODBURL}/civic`);
    console.log(`MongoDB connected: ${conn.connection.name}`);
  } catch (err) {
    console.error("DB connection error:", err);
    process.exit(1);
  }
};
module.exports = connectDB;