const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
  levels,
  format,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom logging functions
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.http(`${req.method} ${req.originalUrl} - ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`;
    
    if (res.statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.http(logMessage);
    }
  });
  
  next();
};

// Security logging
const logSecurityEvent = (event, details = {}) => {
  const securityLog = {
    event,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      // Remove sensitive data
      password: details.password ? '[REDACTED]' : undefined,
      token: details.token ? '[REDACTED]' : undefined,
      email: details.email ? '[REDACTED]' : undefined
    }
  };
  
  logger.warn(`SECURITY: ${event}`, securityLog);
};

// Error logging with context
const logError = (error, context = {}) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      // Remove sensitive data from context
      password: context.password ? '[REDACTED]' : undefined,
      token: context.token ? '[REDACTED]' : undefined,
      email: context.email ? '[REDACTED]' : undefined
    }
  };
  
  logger.error('Application Error', errorLog);
};

// Database operation logging
const logDatabaseOperation = (operation, collection, details = {}) => {
  const dbLog = {
    operation,
    collection,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      // Remove sensitive data
      password: details.password ? '[REDACTED]' : undefined,
      token: details.token ? '[REDACTED]' : undefined
    }
  };
  
  logger.debug(`DATABASE: ${operation} on ${collection}`, dbLog);
};

// Authentication logging
const logAuthEvent = (event, userId, details = {}) => {
  const authLog = {
    event,
    userId,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      // Remove sensitive data
      password: details.password ? '[REDACTED]' : undefined,
      token: details.token ? '[REDACTED]' : undefined
    }
  };
  
  logger.info(`AUTH: ${event}`, authLog);
};

// File upload logging
const logFileUpload = (userId, filename, size, details = {}) => {
  const uploadLog = {
    userId,
    filename,
    size,
    timestamp: new Date().toISOString(),
    details
  };
  
  logger.info(`UPLOAD: File uploaded`, uploadLog);
};

// Performance logging
const logPerformance = (operation, duration, details = {}) => {
  const perfLog = {
    operation,
    duration,
    timestamp: new Date().toISOString(),
    details
  };
  
  if (duration > 1000) { // Log slow operations (>1s)
    logger.warn(`PERFORMANCE: Slow operation detected`, perfLog);
  } else {
    logger.debug(`PERFORMANCE: ${operation}`, perfLog);
  }
};

// Clean up old log files (run daily)
const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const logsDir = path.join(__dirname, '../logs');
  
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);
    
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (Date.now() - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up old log file: ${file}`);
      }
    });
  }
};

// Schedule log cleanup (run daily at midnight)
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

module.exports = {
  logger,
  logRequest,
  logSecurityEvent,
  logError,
  logDatabaseOperation,
  logAuthEvent,
  logFileUpload,
  logPerformance,
  cleanupLogs
};
