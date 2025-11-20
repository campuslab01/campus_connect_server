const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';
const FACEPP_COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';
const FACEPP_FACESET_TOKEN = process.env.FACEPP_FACESET_TOKEN || null;
const FACE_DATA_SECRET = process.env.FACE_DATA_SECRET || process.env.JWT_SECRET || 'face-data-secret';

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(FACE_DATA_SECRET).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptToken(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const key = crypto.createHash('sha256').update(FACE_DATA_SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

exports.detect = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Image file required' });
    const form = new FormData();
    form.append('api_key', FACEPP_API_KEY);
    form.append('api_secret', FACEPP_API_SECRET);
    form.append('image_file', req.file.buffer, { filename: req.file.originalname || 'selfie.jpg' });
    form.append('return_attributes', 'blur,occlusion,headpose,eye_status,emotion,face_quality');
    const resp = await axios.post(FACEPP_DETECT_URL, form, { headers: { ...form.getHeaders() }, timeout: 15000 });
    const faces = resp.data?.faces || [];
    if (faces.length !== 1) return res.status(400).json({ status: 'error', message: 'Exactly one face required' });
    const f = faces[0];
    const quality = f?.attributes?.face_quality?.value ?? 100;
    const blur = f?.attributes?.blur?.blurness?.value ?? 0;
    const occlusion = f?.attributes?.occlusion || {};
    const occlScore = ['left_eye','right_eye','nose','mouth'].reduce((s,k)=> s + (occlusion[k]?.occlusion || 0), 0);
    const passes = quality >= 70 && blur <= 0.5 && occlScore <= 1.5;
    if (!passes) return res.status(400).json({ status: 'error', message: 'Low-quality face. Retake selfie with better lighting and no occlusions.' });
    return res.status(200).json({ status: 'success', face_token: f.face_token, attributes: f.attributes });
  } catch (error) {
    logError('Face detect error', error);
    if (error.response) return res.status(error.response.status).json(error.response.data);
    next(error);
  }
};

exports.liveness = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Selfie required' });
    // Basic anti-spoof using detect attributes as proxy (production liveness API can replace this)
    const form = new FormData();
    form.append('api_key', FACEPP_API_KEY);
    form.append('api_secret', FACEPP_API_SECRET);
    form.append('image_file', req.file.buffer, { filename: req.file.originalname || 'selfie.jpg' });
    form.append('return_attributes', 'blur,occlusion,face_quality');
    const resp = await axios.post(FACEPP_DETECT_URL, form, { headers: { ...form.getHeaders() }, timeout: 15000 });
    const faces = resp.data?.faces || [];
    if (!faces.length) return res.status(400).json({ status: 'error', message: 'No face detected' });
    const f = faces[0];
    const quality = f?.attributes?.face_quality?.value ?? 100;
    const blur = f?.attributes?.blur?.blurness?.value ?? 0;
    const occlusion = f?.attributes?.occlusion || {};
    const occlScore = ['left_eye','right_eye','nose','mouth'].reduce((s,k)=> s + (occlusion[k]?.occlusion || 0), 0);
    const spoofScore = (blur > 0.45 ? 40 : 0) + (quality < 65 ? 40 : 0) + (occlScore > 1.2 ? 20 : 0);
    const isLive = spoofScore <= 40; // configurable threshold
    return res.status(200).json({ status: 'success', isLive, spoofScore });
  } catch (error) {
    logError('Liveness error', error);
    if (error.response) return res.status(error.response.status).json(error.response.data);
    next(error);
  }
};

exports.compare = async (req, res, next) => {
  try {
    const { selfieToken, profileToken, profileImageUrl } = req.body || {};
    let ft1 = selfieToken;
    let ft2 = profileToken;
    if (!ft1 && req.file) {
      const form = new FormData();
      form.append('api_key', FACEPP_API_KEY);
      form.append('api_secret', FACEPP_API_SECRET);
      form.append('image_file', req.file.buffer, { filename: req.file.originalname || 'selfie.jpg' });
      const resp = await axios.post(FACEPP_DETECT_URL, form, { headers: { ...form.getHeaders() }, timeout: 15000 });
      ft1 = resp.data?.faces?.[0]?.face_token;
    }
    if (!ft2 && profileImageUrl) {
      try {
        const img = await axios.get(profileImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const buf = Buffer.from(img.data);
        const form = new FormData();
        form.append('api_key', FACEPP_API_KEY);
        form.append('api_secret', FACEPP_API_SECRET);
        form.append('image_file', buf, { filename: 'profile.jpg' });
        const resp = await axios.post(FACEPP_DETECT_URL, form, { headers: { ...form.getHeaders() }, timeout: 15000 });
        ft2 = resp.data?.faces?.[0]?.face_token;
      } catch (e) {
        const urlParams = new URLSearchParams();
        urlParams.append('api_key', FACEPP_API_KEY);
        urlParams.append('api_secret', FACEPP_API_SECRET);
        urlParams.append('image_url', profileImageUrl);
        const resp = await axios.post(FACEPP_DETECT_URL, urlParams, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        ft2 = resp.data?.faces?.[0]?.face_token;
      }
    }
    if (!ft1 || !ft2) return res.status(400).json({ status: 'error', message: 'Missing face tokens for comparison' });
    const params = new URLSearchParams();
    params.append('api_key', FACEPP_API_KEY);
    params.append('api_secret', FACEPP_API_SECRET);
    params.append('face_token1', ft1);
    params.append('face_token2', ft2);
    const c = await axios.post(FACEPP_COMPARE_URL, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    const { confidence, thresholds } = c.data || {};
    const recommended = thresholds?.['1e-4'] || thresholds?.['1e-5'] || 80;
    return res.status(200).json({ status: 'success', confidence, recommended });
  } catch (error) {
    logError('Compare error', error);
    if (error.response) return res.status(error.response.status).json(error.response.data);
    next(error);
  }
};

exports.verifyUser = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ status: 'error', message: 'Authentication required' });
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Selfie image required' });

    // Detect & quality check
    const detectForm = new FormData();
    detectForm.append('api_key', FACEPP_API_KEY);
    detectForm.append('api_secret', FACEPP_API_SECRET);
    detectForm.append('image_file', req.file.buffer, { filename: req.file.originalname || 'selfie.jpg' });
    detectForm.append('return_attributes', 'blur,occlusion,face_quality');
    const dResp = await axios.post(FACEPP_DETECT_URL, detectForm, { headers: { ...detectForm.getHeaders() }, timeout: 15000 });
    const dFaces = dResp.data?.faces || [];
    if (!dFaces.length) return res.status(400).json({ status: 'error', message: 'No face detected in selfie' });
    const selfieToken = dFaces[0].face_token;
    const quality = dFaces[0]?.attributes?.face_quality?.value ?? 100;
    const blur = dFaces[0]?.attributes?.blur?.blurness?.value ?? 0;
    const occlusion = dFaces[0]?.attributes?.occlusion || {};
    const occlScore = ['left_eye','right_eye','nose','mouth'].reduce((s,k)=> s + (occlusion[k]?.occlusion || 0), 0);
    const spoofScore = (blur > 0.45 ? 40 : 0) + (quality < 65 ? 40 : 0) + (occlScore > 1.2 ? 20 : 0);
    const isLive = spoofScore <= 40;
    if (!isLive) return res.status(400).json({ status: 'error', message: 'Liveness failed. Please retake a clear selfie.' });

    // Detect on profile image
    const profileImageUrl = user.profileImage;
    if (!profileImageUrl) return res.status(400).json({ status: 'error', message: 'Profile image not found' });
    let profileToken = null;
    try {
      const img = await axios.get(profileImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(img.data);
      const pfForm = new FormData();
      pfForm.append('api_key', FACEPP_API_KEY);
      pfForm.append('api_secret', FACEPP_API_SECRET);
      pfForm.append('image_file', buf, { filename: 'profile.jpg' });
      const pfResp = await axios.post(FACEPP_DETECT_URL, pfForm, { headers: { ...pfForm.getHeaders() }, timeout: 15000 });
      profileToken = pfResp.data?.faces?.[0]?.face_token;
    } catch (e) {
      const urlParams = new URLSearchParams();
      urlParams.append('api_key', FACEPP_API_KEY);
      urlParams.append('api_secret', FACEPP_API_SECRET);
      urlParams.append('image_url', profileImageUrl);
      const pfResp = await axios.post(FACEPP_DETECT_URL, urlParams, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
      profileToken = pfResp.data?.faces?.[0]?.face_token;
    }
    if (!profileToken) return res.status(400).json({ status: 'error', message: 'No face detected in profile image' });

    // Compare tokens
    const params = new URLSearchParams();
    params.append('api_key', FACEPP_API_KEY);
    params.append('api_secret', FACEPP_API_SECRET);
    params.append('face_token1', selfieToken);
    params.append('face_token2', profileToken);
    const cmp = await axios.post(FACEPP_COMPARE_URL, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    const { confidence, thresholds } = cmp.data || {};
    const recommended = thresholds?.['1e-4'] || thresholds?.['1e-5'] || 85;
    const pass = typeof confidence === 'number' && confidence >= recommended;
    const finalScore = Math.round(confidence || 0);

    // Update user
    const u = await User.findById(user._id);
    u.lastVerificationAttempt = new Date();
    u.verificationScore = finalScore;
    if (pass && isLive) {
      u.isVerified = true;
      u.faceTokenEncrypted = encryptToken(selfieToken);
    }
    await u.save();

    // Optional: add to faceset
    let facesetAdded = false;
    if (FACEPP_FACESET_TOKEN && u.isVerified) {
      try {
        const addParams = new URLSearchParams();
        addParams.append('api_key', FACEPP_API_KEY);
        addParams.append('api_secret', FACEPP_API_SECRET);
        addParams.append('faceset_token', FACEPP_FACESET_TOKEN);
        addParams.append('face_tokens', selfieToken);
        const addResp = await axios.post('https://api-us.faceplusplus.com/facepp/v3/faceset/addface', addParams, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
        facesetAdded = Boolean(addResp.data?.face_added);
      } catch (e) {}
    }

    return res.status(200).json({ status: 'success', verified: u.isVerified, score: finalScore, liveness: isLive, facesetAdded });
  } catch (error) {
    logError('Verify user error', error);
    if (error.response) return res.status(error.response.status).json(error.response.data);
    next(error);
  }
};

exports.status = async (req, res, next) => {
  try {
    const u = await User.findById(req.user._id);
    return res.status(200).json({ status: 'success', isVerified: Boolean(u?.isVerified), score: u?.verificationScore || 0, lastAttempt: u?.lastVerificationAttempt || null });
  } catch (error) {
    next(error);
  }
};