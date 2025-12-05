const axios = require('axios');

const HIVE_API_KEY = process.env.HIVE_API_KEY;
const HIVE_BASE_URL = process.env.HIVE_BASE_URL || 'https://api.thehive.ai';

const headers = () => ({
  Authorization: `Token ${String(HIVE_API_KEY || '').trim()}`,
  'Content-Type': 'application/json'
});

const postJson = async (path, payload) => {
  const url = `${HIVE_BASE_URL}${path}`;
  const resp = await axios.post(url, payload, { headers: headers(), timeout: 20000 });
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