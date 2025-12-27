module.exports = function requestTimeout(ms = 10000) {
  return (req, res, next) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      res.status(503).json({
        success: false,
        status: 'error',
        reason: 'REQUEST_TIMEOUT',
        message: 'Request timed out'
      });
    }, ms);
    res.on('finish', () => {
      finished = true;
      clearTimeout(timer);
    });
    next();
  };
}
