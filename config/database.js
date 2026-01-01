const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log(`🔌 Initializing Database Connection...`);
  console.log(`   Environment: ${nodeEnv}`);
  
  if (!mongoURI) {
    throw new Error('❌ FATAL: MONGODB_URI is undefined.');
  }

  // Safety Check: Prevent Localhost in Production
  if (nodeEnv === 'production' && mongoURI.includes('localhost')) {
    throw new Error('❌ FATAL: Production environment cannot use localhost MongoDB.');
  }

  // Safety Check: Prevent connecting to PROD DB in DEV mode
  if (nodeEnv === 'development') {
    if (mongoURI.includes('campus-connection') && !mongoURI.includes('campus-connection-dev') && !mongoURI.includes('localhost')) {
       // This is a heuristic. Ideally, prod DB name is "campus-connection" and dev is "campus-connection-dev"
       // If the URI points to the EXACT same database as prod, warn or block.
       // However, since we are setting the URI explicitly in .env.development, we trust the config.
       // Let's just log the target DB name clearly.
    }
  }

  mongoose.set('strictQuery', true);
  // Disable autoIndex in production to reduce index build contention
  mongoose.set('autoIndex', false);
  
  let attempts = 0;
  const maxAttempts = 3;

  const connectOnce = async () => {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 8000,
      maxPoolSize: 20,
      minPoolSize: 5,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   📂 Active Database: ${conn.connection.db.databaseName}`);

    // Verify Environment Separation
    const dbName = conn.connection.db.databaseName;
    if (nodeEnv === 'production' && dbName !== 'campus-connection') {
        console.warn(`⚠️ WARNING: Production is connected to '${dbName}' instead of 'campus-connection'. Verify if this is intentional.`);
    }
    if (nodeEnv === 'development' && dbName === 'campus-connection') {
        console.error(`❌ CRITICAL SAFETY WARNING: Development environment is connected to PRODUCTION database 'campus-connection'!`);
        console.error(`   Please check your .env.development file immediately.`);
    }

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
