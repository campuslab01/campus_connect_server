const express = require('express');
const multer = require('multer');
const { generalLimiter } = require('../middlewares/security');
const { authenticateToken } = require('../middlewares/auth');
const ctrl = require('../controllers/hiveVerifyController');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.use(authenticateToken);
router.post('/verify-selfie', generalLimiter, upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'profile', maxCount: 1 }
]), ctrl.verifySelfie);

module.exports = router;