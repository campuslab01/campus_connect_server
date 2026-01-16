const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Enhanced rate limiting for different endpoints
const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      status: 'error',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    // Skip rate limiting for development
    skip: (req) => process.env.NODE_ENV === 'development',
    // Use the built-in ipKeyGenerator helper for IPv6 compatibility
    keyGenerator: (req) => {
      // Use IP + User ID for authenticated requests
      if (req.user && req.user._id) {
        return `${req.ip}-${req.user._id}`;
      }
      // Use the built-in ipKeyGenerator for proper IPv6 handling
      return rateLimit.ipKeyGenerator(req);
    }
  });
};

// General API rate limiting
const generalLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP, please try again later.'
);

// Strict rate limiting for authentication endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  'Too many authentication attempts, please try again later.',
  true // Skip successful requests
);

// Rate limiting for password reset
const passwordResetLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts per hour
  'Too many password reset attempts, please try again later.'
);

// Rate limiting for file uploads
const uploadLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  20, // 20 uploads per hour
  'Too many file uploads, please try again later.'
);

// Rate limiting for search endpoints
const searchLimiter = createRateLimit(
  1 * 60 * 1000, // 1 minute
  30, // 30 searches per minute
  'Too many search requests, please slow down.'
);

// Speed limiter for additional protection
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 80, // Begin adding delay as users approach the limit
  delayMs: () => 250, // Add 250ms delay per request after delayAfter
  maxDelayMs: 5000, // Cap maximum delay to 5 seconds
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  next();
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Remove any potential XSS attempts from query parameters
  const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  
  next();
};

// IP whitelist middleware (for admin endpoints)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length === 0 || allowedIPs.includes(clientIP)) {
      next();
    } else {
      res.status(403).json({
        status: 'error',
        message: 'Access denied from this IP address'
      });
    }
  };
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSizeBytes = parseInt(maxSize) * 1024 * 1024; // Convert MB to bytes
    
    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        status: 'error',
        message: 'Request entity too large'
      });
    }
    
    next();
  };
};

// Session timeout middleware
const sessionTimeout = (timeoutMs = 30 * 60 * 1000) => { // 30 minutes default
  return (req, res, next) => {
    if (req.user && req.user.lastSeen) {
      const timeSinceLastSeen = Date.now() - new Date(req.user.lastSeen).getTime();
      
      if (timeSinceLastSeen > timeoutMs) {
        return res.status(401).json({
          status: 'error',
          message: 'Session expired, please login again'
        });
      }
    }
    
    next();
  };
};

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  uploadLimiter,
  searchLimiter,
  speedLimiter,
  securityHeaders,
  sanitizeRequest,
  ipWhitelist,
  requestSizeLimiter,
  sessionTimeout
};
