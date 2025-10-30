// Test MongoDB connection string format
const testConnectionString = (uri) => {
  console.log('Testing MongoDB connection string format...');
  console.log('URI:', uri);
  
  try {
    const url = new URL(uri);
    console.log('✅ Valid URL format');
    console.log('Protocol:', url.protocol);
    console.log('Hostname:', url.hostname);
    console.log('Database:', url.pathname.substring(1));
    console.log('Search params:', url.search);
    
    // Check if it's a valid MongoDB URI
    if (uri.startsWith('mongodb+srv://')) {
      console.log('✅ Correct MongoDB SRV format');
    } else {
      console.log('❌ Should start with mongodb+srv://');
    }
    
    // Check database name
    const dbName = url.pathname.substring(1);
    if (dbName && !dbName.includes('?')) {
      console.log('✅ Database name is correct:', dbName);
    } else {
      console.log('❌ Database name should be before the ?');
    }
    
  } catch (error) {
    console.log('❌ Invalid URI format:', error.message);
  }
};

// Example of correct format
console.log('\n=== CORRECT FORMAT EXAMPLE ===');
testConnectionString('mongodb+srv://username:password@cluster0.abc123.mongodb.net/campus-connection?retryWrites=true&w=majority');

console.log('\n=== COMMON MISTAKES ===');
console.log('❌ Wrong: mongodb+srv://user:pass@cluster.mongodb.net/?db=campus-connection');
console.log('❌ Wrong: mongodb+srv://user:pass@cluster.mongodb.net/campus-connection?db=campus-connection');
console.log('✅ Right: mongodb+srv://user:pass@cluster0.abc123.mongodb.net/campus-connection?retryWrites=true&w=majority');
