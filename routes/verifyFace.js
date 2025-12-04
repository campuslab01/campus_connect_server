const express = require('express');
const multer = require('multer');
const { generalLimiter } = require('../middlewares/security');
const verifyFace = require('../controllers/verifyFaceController');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 }, storage: multer.memoryStorage() });

router.post('/verify', generalLimiter, upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'profile', maxCount: 1 }
]), verifyFace.verify);

module.exports = router;