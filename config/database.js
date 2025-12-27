const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-connection';
  mongoose.set('strictQuery', true);
  let attempts = 0;
  const maxAttempts = 3;
  const connectOnce = async () => {
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      heartbeatFrequencyMS: 8000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      retryReads: true,
      retryWrites: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed through app termination');
      process.exit(0);
    });
  };
  while (attempts < maxAttempts) {
    try {
      await connectOnce();
      return;
    } catch (error) {
      attempts += 1;
      console.error(`❌ MongoDB connection attempt ${attempts} failed: ${error.message}`);
      if (attempts >= maxAttempts) {
        process.exit(1);
      }
      const waitMs = 1000 * Math.pow(2, attempts);
      await new Promise(res => setTimeout(res, waitMs));
    }
  }
};

module.exports = connectDB;
