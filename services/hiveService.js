const axios = require('axios');
const FormData = require('form-data');

const HIVE_ACCESS_KEY_ID = process.env.HIVE_ACCESS_KEY_ID;
const HIVE_SECRET_KEY = process.env.HIVE_SECRET_KEY;
const HIVE_API_KEY = process.env.HIVE_API_KEY || HIVE_SECRET_KEY;
const HIVE_BASE_URL = process.env.HIVE_BASE_URL || 'https://api.thehive.ai';

const headers = () => {
  const h = { 'Content-Type': 'application/json' };
  const token = String(HIVE_API_KEY || '').trim();
  if (token) {
    h.Authorization = `Token ${token}`;
  }
  // Access Key ID is not required by Hive API for token auth, but we allow env storage for completeness
  // If future endpoints require it, add appropriate header usage here
  return h;
};

const postJson = async (path, payload) => {
  const url = `${HIVE_BASE_URL}${path}`;
  const resp = await axios.post(url, payload, { headers: headers(), timeout: 20000 });
  return resp.data;
};

const postForm = async (path, fields) => {
  const url = `${HIVE_BASE_URL}${path}`;
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (Buffer.isBuffer(v)) {
      form.append(k, v, { filename: `${k}.jpg`, contentType: 'image/jpeg' });
    } else {
      form.append(k, v);
    }
  });
  const resp = await axios.post(url, form, {
    headers: { ...headers(), ...form.getHeaders() },
    timeout: 20000
  });
  return resp.data;
};

exports.verifyFaces = async (image1Base64, image2Base64) => {
  const data = await postJson('/api/face/verification', {
    image1: image1Base64,
    image2: image2Base64
  });
  return data;
};

exports.detectFace = async (imageBase64) => {
  const data = await postJson('/api/face/detect', { image: imageBase64 });
  return data;
};

exports.detectFaceMedia = async (imageBuffer) => {
  const data = await postForm('/api/face/detect', { media: imageBuffer });
  return data;
};

exports.verifyFacesMedia = async (image1Buffer, image2Buffer) => {
  const data = await postForm('/api/face/verification', { media1: image1Buffer, media2: image2Buffer });
  return data;
};