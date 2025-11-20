const axios = require('axios');
const FormData = require('form-data');
const User = require('../models/User');
const { logError } = require('../utils/logger');

const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';
const FACEPP_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

module.exports = {};