# Campus Connection Server

Backend API for Campus Connection - A college dating and social app.

## 🚀 Features

- **User Authentication**: Secure JWT-based authentication with bcrypt password hashing
- **Profile Management**: Complete user profiles with validation and image uploads
- **Image Uploads**: AWS S3 integration for scalable file storage
- **Chat System**: Real-time messaging between users
- **Confession System**: Anonymous confession sharing
- **Search & Discovery**: Advanced user search with filters
- **Security**: Rate limiting, CORS, input sanitization, and security headers
- **Validation**: Comprehensive frontend and backend validation
- **Error Handling**: Professional error handling and logging

## 🛠 Tech Stack

- **Runtime**: Node.js (>=16.0.0)
- **Framework**: Express.js 5.1.0
- **Database**: MongoDB with Mongoose 8.19.0
- **Authentication**: JWT with bcryptjs 3.0.2
- **File Storage**: AWS S3 SDK 2.1691.0
- **Security**: Helmet, CORS, express-rate-limit
- **Validation**: express-validator 7.2.1
- **Logging**: Winston 3.11.0
- **Email**: Nodemailer 6.9.8

## 📁 Project Structure

```
campus_connect_server/
├── config/
│   └── database.js          # MongoDB connection configuration
├── controllers/
│   ├── authController.js    # Authentication logic
│   ├── userController.js    # User management
│   ├── uploadController.js  # File upload handling
│   ├── chatController.js    # Chat functionality
│   └── confessionController.js # Confession system
├── middlewares/
│   ├── auth.js             # JWT authentication middleware
│   ├── validation.js       # Input validation rules
│   ├── security.js         # Security middleware
│   └── errorHandler.js     # Global error handling
├── models/
│   ├── User.js             # User schema with validation
│   ├── Chat.js             # Chat message schema
│   └── Confession.js       # Confession schema
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── users.js            # User management routes
│   ├── upload.js           # File upload routes
│   ├── chat.js             # Chat routes
│   └── confession.js       # Confession routes
├── utils/
│   ├── logger.js           # Winston logging configuration
│   ├── upload.js           # AWS S3 upload utilities
│   └── seedData.js         # Database seeding
├── uploads/                # Local file storage (development)
├── server.js               # Main server file
├── package.json            # Dependencies and scripts
└── env.example             # Environment variables template
```

## 🚀 Installation & Setup

### Prerequisites
- Node.js (>=16.0.0)
- MongoDB Atlas account or local MongoDB
- AWS S3 account (optional, for production)

### 1. Clone and Install
```bash
git clone <repository-url>
cd campus_connect_server
npm install
```

### 2. Environment Configuration
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/campus-connection

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=7d

# Server
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

# AWS S3 (Optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
```

### 3. Start the Server
```bash
# Development
npm run dev

# Production
npm start

# Test
npm test
```

## 📚 API Documentation

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user
```json
{
  "name": "John Doe",
  "email": "john@campus.com",
  "password": "SecurePass123",
  "age": 22,
  "gender": "male",
  "college": "University Name",
  "department": "Computer Science",
  "year": "Junior",
  "profileImage": "https://example.com/image.jpg",
  "photos": ["https://example.com/image.jpg"]
}
```

#### POST `/api/auth/login`
Login user
```json
{
  "email": "john@campus.com",
  "password": "SecurePass123"
}
```

#### GET `/api/auth/me`
Get current user profile (requires authentication)

### User Management Endpoints

#### GET `/api/users/search`
Search users with filters
```
Query Parameters:
- gender: male|female|other|all
- department: Computer Science|Engineering|...
- college: University Name
- ageMin: 18
- ageMax: 30
- interests: ["coding", "music"]
- page: 1
- limit: 20
```

#### PUT `/api/users/profile`
Update user profile (requires authentication)

### File Upload Endpoints

#### POST `/api/upload/profile`
Upload profile image (requires authentication)

#### POST `/api/upload/images`
Upload multiple images (requires authentication)

#### DELETE `/api/upload/images/:imageUrl`
Delete an image (requires authentication)

## 🔒 Security Features

- **Password Hashing**: bcrypt with salt rounds (12)
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents abuse with configurable limits
- **CORS Protection**: Configured for specific origins
- **Input Validation**: Comprehensive validation on all inputs
- **Security Headers**: Helmet.js for security headers
- **Request Sanitization**: XSS and injection protection
- **File Upload Security**: Type and size validation

## 🧪 Testing

Run the comprehensive test suite:
```bash
node test-auth.js
```

Tests include:
- User creation and validation
- Password hashing and comparison
- JWT token generation and verification
- Database indexes
- Error handling

## 📊 Database Schema

### User Model
```javascript
{
  name: String (required, 2-50 chars)
  email: String (required, unique, valid email)
  password: String (required, min 6 chars, hashed)
  age: Number (required, 18-30)
  gender: String (required, enum: male|female|other)
  college: String (required, 2-100 chars)
  department: String (required, 2-50 chars)
  year: String (required, enum: Freshman|Sophomore|...)
  bio: String (optional, max 500 chars)
  photos: [String] (required, min 1, max 6)
  profileImage: String (required, valid URL)
  interests: [String] (optional)
  lookingFor: [String] (optional)
  relationshipStatus: String (optional)
  verified: Boolean (default: false)
  isActive: Boolean (default: true)
  lastSeen: Date (default: now)
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

## 🚀 Deployment

### Render.com (Recommended)
1. Connect your GitHub repository
2. Set environment variables in Render dashboard
3. Deploy automatically on push

### Environment Variables for Production
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-production-secret
NODE_ENV=production
CLIENT_URL=https://your-frontend-domain.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
```

## 📈 Performance

- **Database Indexing**: Optimized queries with proper indexes
- **Rate Limiting**: Prevents server overload
- **Caching**: JWT token caching for performance
- **File Compression**: Optimized image handling
- **Connection Pooling**: Efficient database connections

## 🔧 Development

### Adding New Features
1. Create model in `models/`
2. Add controller in `controllers/`
3. Define routes in `routes/`
4. Add validation in `middlewares/validation.js`
5. Update API documentation

### Code Style
- Use async/await for database operations
- Implement proper error handling
- Add input validation
- Include JSDoc comments
- Follow RESTful API conventions

## 📞 Support

For issues and questions:
1. Check the test suite: `node test-auth.js`
2. Review the API documentation
3. Check environment variables
4. Verify database connection

---

**Last Updated**: October 29, 2025 - Production-ready with comprehensive validation and security features