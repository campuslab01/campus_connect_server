// Test MongoDB connection string format
const testMongoURI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/campus-connection?retryWrites=true&w=majority';

console.log('Testing MongoDB URI format...');
console.log('MONGODB_URI:', testMongoURI ? 'SET' : 'NOT SET');
console.log('URI starts with mongodb+srv:', testMongoURI.startsWith('mongodb+srv://'));
console.log('URI contains @cluster', testMongoURI.includes('@cluster'));
console.log('URI contains .mongodb.net', testMongoURI.includes('.mongodb.net'));

// Test if it's a valid URI format
try {
  const url = new URL(testMongoURI);
  console.log('✅ Valid URI format');
  console.log('Protocol:', url.protocol);
  console.log('Hostname:', url.hostname);
  console.log('Database:', url.pathname.substring(1));
} catch (error) {
  console.log('❌ Invalid URI format:', error.message);
}
