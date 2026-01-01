const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Logic to load .env.development if it exists and we want to force it, 
// otherwise fall back to .env
const loadEnv = () => {
    // Check if .env.development exists
    const devEnvPath = path.join(__dirname, '..', '.env.development');
    const defaultEnvPath = path.join(__dirname, '..', '.env');

    if (fs.existsSync(devEnvPath)) {
        console.log('📂 Loading config from .env.development');
        dotenv.config({ path: devEnvPath });
    } else {
        console.log('📂 Loading config from .env');
        dotenv.config({ path: defaultEnvPath });
    }
};

const executeReset = async () => {
  try {
    loadEnv();
    console.log('🔄 Starting Database Safe Reset...');

    // 1. Safety Checks
    const nodeEnv = process.env.NODE_ENV || 'development';
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
        throw new Error('❌ CONFIG ERROR: MONGODB_URI is undefined.');
    }

    console.log('🔍 Environment Verification:');
    console.log(`   NODE_ENV: ${nodeEnv}`);
    console.log(`   URI: ${mongoURI.replace(/:([^@]+)@/, ':****@')}`); // Mask password

    // STOP if Production
    if (nodeEnv === 'production') {
      throw new Error('❌ SAFETY ERROR: Cannot reset database in PRODUCTION mode. Operation Aborted.');
    }

    // STOP if Production Atlas detected (heuristic)
    if (mongoURI.includes('mongodb.net') && !mongoURI.includes('dev') && !mongoURI.includes('test') && !mongoURI.includes('staging')) {
        if (process.env.FORCE_RESET !== 'true') {
            throw new Error('❌ SAFETY ERROR: Connected to a remote Atlas instance that does not look like dev/test. Set FORCE_RESET=true to override if you are sure.');
        }
    }

    // Connect
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected.');

    const dbName = mongoose.connection.db.databaseName;
    console.log(`   Target Database: ${dbName}`);
    
    // 2. Identify Collections
    const collections = await mongoose.connection.db.collections();
    
    if (collections.length === 0) {
        console.log('   ⚠️ No collections found to clean.');
        await mongoose.disconnect();
        process.exit(0);
    }

    console.log(`\n📋 Found ${collections.length} collections. Cleaning...`);

    // 3. Data Deletion (deleteMany only)
    const summary = {};
    const skipped = [];

    for (const collection of collections) {
      const name = collection.collectionName;
      
      // Skip system collections
      if (name.startsWith('system.')) {
        continue;
      }

      try {
          const countBefore = await collection.countDocuments();
          
          if (countBefore > 0) {
              await collection.deleteMany({});
              console.log(`   🗑️  Cleaned [${name}]: ${countBefore} documents deleted.`);
              summary[name] = countBefore;
          } else {
              skipped.push(name);
          }
      } catch (err) {
          console.error(`   ❌ Failed to clean [${name}]: ${err.message}`);
      }
    }

    if (skipped.length > 0) {
        console.log(`   ℹ️  Skipped empty collections: ${skipped.join(', ')}`);
    }

    console.log('\n✅ Database reset complete.');
    console.log('   Summary of deletions:', JSON.stringify(summary, null, 2));
    
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    process.exit(1);
  }
};

executeReset();
