const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Confession = require('../models/Confession');
require('dotenv').config();

// Sample users data
const sampleUsers = [
  {
    name: 'Emma Wilson',
    email: 'emma.wilson@stanford.edu',
    password: 'password123',
    age: 20,
    gender: 'female',
    college: 'Stanford University',
    department: 'Computer Science',
    year: '3rd',
    bio: 'Love coding, hiking, and good coffee. Always up for exploring new places around campus!',
    relationshipStatus: 'Single',
    interests: ['Programming', 'Hiking', 'Coffee', 'Travel', 'Photography'],
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=800&fit=crop&q=85',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=800&fit=crop&q=85'
    ],
    verified: true,
    lookingFor: ['Long term', 'Friendship']
  },
  {
    name: 'Michael Chen',
    email: 'michael.chen@berkeley.edu',
    password: 'password123',
    age: 22,
    gender: 'male',
    college: 'UC Berkeley',
    department: 'Engineering',
    year: 'Senior',
    bio: 'Passionate about sustainable technology and rock climbing. Looking for someone to share adventures with!',
    relationshipStatus: 'Single',
    interests: ['Rock Climbing', 'Sustainability', 'Music', 'Cooking', 'Travel'],
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop&q=85',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=800&fit=crop&q=85'
    ],
    verified: true,
    lookingFor: ['Short term', 'Friendship']
  },
  {
    name: 'Sofia Rodriguez',
    email: 'sofia.rodriguez@usc.edu',
    password: 'password123',
    age: 21,
    gender: 'female',
    college: 'USC',
    department: 'Business',
    year: 'Junior',
    bio: 'Future entrepreneur with a love for art and good food. Let\'s grab brunch and talk about our dreams!',
    relationshipStatus: 'Single',
    interests: ['Art', 'Entrepreneurship', 'Food', 'Yoga', 'Fashion'],
    photos: [
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=800&fit=crop&q=85',
      'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=600&h=800&fit=crop&q=85'
    ],
    verified: false,
    lookingFor: ['Long term', 'Friendship']
  },
  {
    name: 'David Kim',
    email: 'david.kim@ucla.edu',
    password: 'password123',
    age: 23,
    gender: 'male',
    college: 'UCLA',
    department: 'Arts',
    year: 'Graduate',
    bio: 'Film student and coffee enthusiast. Always looking for the perfect shot and the perfect espresso.',
    relationshipStatus: 'Single',
    interests: ['Film', 'Photography', 'Coffee', 'Books', 'Travel'],
    photos: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&h=800&fit=crop&q=85',
      'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&h=800&fit=crop&q=85'
    ],
    verified: true,
    lookingFor: ['Long term']
  },
  {
    name: 'Ashley Thompson',
    email: 'ashley.thompson@stanford.edu',
    password: 'password123',
    age: 19,
    gender: 'female',
    college: 'Stanford University',
    department: 'Medicine',
    year: 'Freshman',
    bio: 'Pre-med student with a passion for helping others. Love dancing, reading, and late-night study sessions.',
    relationshipStatus: 'Single',
    interests: ['Dancing', 'Medicine', 'Reading', 'Volunteering', 'Fitness'],
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop&q=85',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=800&fit=crop&q=85'
    ],
    verified: false,
    lookingFor: ['Long term', 'Friendship']
  }
];

// Sample confessions data
const sampleConfessions = [
  {
    content: 'I have a crush on someone in my CS class but I\'m too shy to talk to them. They always sit in the front row and ask really smart questions. Maybe I should try to form a study group?',
    category: 'love',
    tags: ['crush', 'shy', 'study'],
    isAnonymous: true
  },
  {
    content: 'The library at 2 AM hits different. There\'s something magical about studying when the whole campus is quiet. Anyone else feel this way?',
    category: 'academic',
    tags: ['library', 'studying', 'late night'],
    isAnonymous: true
  },
  {
    content: 'I made a new friend today in the dining hall! We both reached for the last slice of pizza at the same time and ended up sharing it. Sometimes the best connections happen over food.',
    category: 'friendship',
    tags: ['new friend', 'dining hall', 'pizza'],
    isAnonymous: true
  },
  {
    content: 'Missing home so much today. College is amazing but sometimes you just want your mom\'s cooking and your childhood bedroom. Anyone else feeling homesick?',
    category: 'personal',
    tags: ['homesick', 'family', 'college life'],
    isAnonymous: true
  },
  {
    content: 'Just finished my first all-nighter for finals. Coffee is my best friend right now. Pro tip: the 24-hour study rooms in the engineering building are the best!',
    category: 'academic',
    tags: ['finals', 'all-nighter', 'coffee', 'study tips'],
    isAnonymous: true
  }
];

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-connection';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected for seeding');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const seedUsers = async () => {
  try {
    // Clear existing users
    await User.deleteMany({});
    console.log('🗑️ Cleared existing users');

    // Hash passwords and create users
    for (const userData of sampleUsers) {
      const salt = await bcrypt.genSalt(12);
      userData.password = await bcrypt.hash(userData.password, salt);
      
      const user = new User(userData);
      await user.save();
    }

    console.log(`✅ Created ${sampleUsers.length} users`);
  } catch (error) {
    console.error('❌ Error seeding users:', error.message);
  }
};

const seedConfessions = async () => {
  try {
    // Clear existing confessions
    await Confession.deleteMany({});
    console.log('🗑️ Cleared existing confessions');

    // Get some users to be authors
    const users = await User.find().limit(3);
    
    // Create confessions
    for (let i = 0; i < sampleConfessions.length; i++) {
      const confessionData = {
        ...sampleConfessions[i],
        author: users[i % users.length]._id,
        isApproved: true
      };
      
      const confession = new Confession(confessionData);
      await confession.save();
    }

    console.log(`✅ Created ${sampleConfessions.length} confessions`);
  } catch (error) {
    console.error('❌ Error seeding confessions:', error.message);
  }
};

const seedData = async () => {
  try {
    await connectDB();
    
    console.log('🌱 Starting database seeding...');
    
    await seedUsers();
    await seedConfessions();
    
    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📝 Sample login credentials:');
    console.log('Email: emma.wilson@stanford.edu');
    console.log('Password: password123');
    console.log('\nEmail: michael.chen@berkeley.edu');
    console.log('Password: password123');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedData();
}

module.exports = { seedData, sampleUsers, sampleConfessions };
