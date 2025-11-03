/**
 * Health check endpoint for testing API connectivity
 * @route GET /health
 * @access Public
 */
const healthCheck = (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

module.exports = { healthCheck };

