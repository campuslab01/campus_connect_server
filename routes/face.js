const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middlewares/auth');
const { generalLimiter } = require('../middlewares/security');
const face = require('../controllers/faceController');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticateToken);

router.post('/detect', generalLimiter, upload.single('image'), face.detect);
router.post('/liveness', generalLimiter, upload.single('selfie'), face.liveness);
router.post('/compare', generalLimiter, upload.single('selfie'), face.compare);
router.post('/verify-user', generalLimiter, upload.single('selfie'), face.verifyUser);
router.get('/status', generalLimiter, face.status);

module.exports = router;