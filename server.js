const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env' : '.env.development';
const envPath = path.resolve(__dirname, envFile);

console.log(`📂 Loading environment config from: ${envFile}`);
dotenv.config({ path: envPath });

// Safety check for NODE_ENV consistency
if (process.env.NODE_ENV && process.env.NODE_ENV !== nodeEnv) {
  console.warn(`⚠️ Warning: NODE_ENV in file (${process.env.NODE_ENV}) differs from system (${nodeEnv}). Using system value.`);
}

if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 Environment Variables Debug:');
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
  console.log('CLIENT_URL:', process.env.CLIENT_URL || 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
  console.log('SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
  console.log('SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
}

// Critical Environment Check
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  console.error('❌ FATAL ERROR: Missing required environment variables:', missingEnv.join(', '));
  process.exit(1);
}
if (process.env.NODE_ENV !== 'development') {
  if (!process.env.CLIENT_URL) {
    console.error('❌ FATAL ERROR: CLIENT_URL is required in non-development environments');
    process.exit(1);
  }
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('localhost')) {
    console.error('❌ FATAL ERROR: MONGODB_URI must not point to localhost in non-development environments');
    process.exit(1);
  }
}

const HIVE_ENABLED = Boolean(process.env.HIVE_BASE_URL && (process.env.HIVE_API_KEY || process.env.HIVE_SECRET_KEY));
if (!HIVE_ENABLED) {
  console.error('Hive verification disabled: HIVE_BASE_URL:', process.env.HIVE_BASE_URL ? 'SET' : 'MISSING', 'HIVE_API_KEY:', process.env.HIVE_API_KEY ? 'SET' : 'MISSING');
}

// Initialize email service
const { initializeEmailService } = require('./utils/emailService');
initializeEmailService();

// Ensure Database Indexes
const ensureIndexes = require('./utils/dbOptimizer');
mongoose.connection.once('connected', () => {
  ensureIndexes();
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const confessionRoutes = require('./routes/confession');
const notificationRoutes = require('./routes/notifications');
const { notifyTest } = require('./controllers/notificationController');
const e2eeRoutes = require('./routes/e2ee');
const paymentRoutes = require('./routes/payment');
const hiveRoutes = require('./routes/hive');
const verifyRoutes = require('./routes/verify');
const { healthCheck } = require('./routes/health');

// Import middleware
const errorHandler = require('./middlewares/errorHandler');
const { authenticateToken } = require('./middlewares/auth');
const { 
  generalLimiter, 
  authLimiter, 
  uploadLimiter, 
  searchLimiter,
  speedLimiter,
  securityHeaders,
  sanitizeRequest,
  requestSizeLimiter
} = require('./middlewares/security');
const { logRequest, logError } = require('./utils/logger');

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", process.env.SERVER_PUBLIC_URL || process.env.CLIENT_URL || process.env.RAILWAY_URL],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Custom security headers
app.use(securityHeaders);

// Request sanitization
app.use(sanitizeRequest);

// Request size limiting
app.use(requestSizeLimiter('10mb'));

// Logging middleware
app.use(logRequest);

// CORS configuration - Define allowed origins first
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.CLIENT_URL, // Main client URL
  process.env.RAILWAY_URL ? `${process.env.RAILWAY_URL}` : null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.GITHUB_PAGES_URL ? `https://${process.env.GITHUB_PAGES_URL}` : null,
].filter(Boolean); // Remove null/undefined values

// CORS middleware - handles OPTIONS requests automatically
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow all Vercel deployments (for dynamic preview deployments)
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }

    // Allow GitHub Pages if configured
    if (origin.includes('github.io') && process.env.GITHUB_PAGES_URL) {
      return callback(null, true);
    }

      console.warn(`❌ CORS blocked request from origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  maxAge: 86400 // Cache preflight response for 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Speed limiting (skip OPTIONS requests) - Applied only to API routes
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  return speedLimiter(req, res, next);
});

// General rate limiting (skip OPTIONS requests) - Applied only to API routes
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  return generalLimiter(req, res, next);
});


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads with CORS headers
// Apply CORS middleware specifically for uploads route
// Images should be publicly accessible, so we allow all known origins
app.use('/uploads', cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    // Allow if in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Allow Vercel origin as default (for image requests)
    if (origin.includes('vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    // Allow the request (images are public anyway)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range'],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Accept-Ranges']
}));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath, stat) => {
    // Get origin from request
    const origin = res.req?.headers?.origin || res.getHeader('origin');
    
    // Set CORS headers (backup in case cors middleware didn't catch it)
          if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
          } else {
            // Default to client URL from env
            res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
          }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Set content-type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.gif') {
      res.setHeader('Content-Type', 'image/gif');
    } else if (ext === '.webp') {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// 404 handler for uploads (catches requests for files that don't exist)
app.use('/uploads', (req, res) => {
  const origin = req.headers.origin;
  
  // Allow all Vercel origins and localhost for images
  let corsOrigin = '*';
  if (origin) {
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app') || origin.includes('localhost')) {
      corsOrigin = origin;
    }
  } else if (process.env.CLIENT_URL) {
    corsOrigin = process.env.CLIENT_URL;
  }
  
  // Set CORS headers even for 404s
  res.header('Access-Control-Allow-Origin', corsOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  res.status(404).json({
    status: 'error',
    message: 'Image not found. File may have been deleted or moved to Cloudinary.'
  });
});

// Health check endpoints (public, no auth required)
// These should be before API routes to avoid middleware interference
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// API Routes with specific rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', authenticateToken, searchLimiter, userRoutes);
app.use('/api/upload', authenticateToken, uploadLimiter, uploadRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/confessions', authenticateToken, confessionRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
// Manual test endpoint to trigger a notification for the authenticated user
app.post('/api/notify/test', authenticateToken, notifyTest);
app.use('/api/e2ee', e2eeRoutes);
app.use('/api/payment', paymentRoutes);
if (HIVE_ENABLED) {
  app.use('/api', hiveRoutes);
} else {
  app.post('/api/verify-selfie', authenticateToken, (req, res) => {
    res.status(503).json({ status: 'error', message: 'Verification provider unavailable' });
  });
}
app.use('/api', authenticateToken, verifyRoutes);

// 404 handler - catch all routes that don't match any API endpoints
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use(errorHandler);

// Import database connection
const connectDB = require('./config/database');

// Import Socket.io initialization
const { initializeSocket } = require('./utils/socket');

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API URL: http://localhost:${PORT}/api`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
    });

    // Initialize Socket.io
    initializeSocket(httpServer);
    console.log(`🔌 Socket.io initialized`);

    // Set server timeout to 120 seconds to handle slow operations/cold starts
    httpServer.setTimeout(120000);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('❌ Unhandled Promise Rejection:', err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

startServer();

module.exports = app;
