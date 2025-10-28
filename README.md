# Campus Connection API Server

Backend API server for Campus Connection - A college dating and social app.

## Features

- User authentication and authorization
- Real-time chat functionality
- Confession posting and management
- File upload handling
- User profile management
- Secure API endpoints with rate limiting

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- AWS S3 for file storage
- Winston for logging

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/campus-connection

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=7d

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# Server
PORT=5000
NODE_ENV=production

# CORS
CLIENT_URL=https://your-frontend-url.vercel.app
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/users` - Get users
- `POST /api/chat` - Send message
- `GET /api/confessions` - Get confessions
- `POST /api/confessions` - Create confession

## Deployment

This server is designed to be deployed on Render.com with the following configuration:

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Node Version**: 18.x or 20.x
