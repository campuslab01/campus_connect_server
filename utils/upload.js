const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Allowed MIME types
const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp'
];

// Allowed file extensions
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// File filter with enhanced security
const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
  
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp files are allowed.'), false);
  }
  
  // Check for suspicious file names
  const suspiciousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.scr$/i,
    /\.pif$/i,
    /\.vbs$/i,
    /\.js$/i,
    /\.php$/i,
    /\.asp$/i,
    /\.jsp$/i
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
    return cb(new Error('Suspicious file name detected.'), false);
  }
  
  cb(null, true);
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3 // Maximum 3 files overall per request
  },
  fileFilter: fileFilter
});

// Cloudinary Configuration (recommended for production)
let cloudinary;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configured');
}

// Upload to Cloudinary
const uploadToCloudinary = async (file, folder = 'profiles') => {
  try {
    if (!cloudinary) {
      throw new Error('Cloudinary is not configured');
    }

    const result = await cloudinary.uploader.upload(file.path, {
      folder: `campus-connection/${folder}`,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 800, crop: 'limit', quality: 'auto' }
      ]
    });

    // Delete local file after Cloudinary upload
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return result.secure_url; // Use secure_url for HTTPS
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Delete from Cloudinary
const deleteFromCloudinary = async (url) => {
  try {
    if (!cloudinary) {
      return false;
    }

    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{filename}.{ext}
    const publicIdMatch = url.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (!publicIdMatch) {
      console.error('Invalid Cloudinary URL:', url);
      return false;
    }

    const publicId = publicIdMatch[1].replace(/\.[^.]+$/, ''); // Remove file extension
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    return result.result === 'ok';
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
};

// AWS S3 Configuration (alternative to Cloudinary)
const AWS = require('aws-sdk');

let s3;
if (process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  console.log('✅ AWS S3 configured');
}

// Upload to S3
const uploadToS3 = async (file, folder = 'profiles') => {
  try {
    if (!s3) {
      throw new Error('AWS S3 is not configured');
    }

    const fileContent = fs.readFileSync(file.path);
    const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: fileContent,
      ContentType: file.mimetype,
      ACL: 'public-read'
    };

    const result = await s3.upload(params).promise();
    
    // Delete local file after S3 upload
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    return result.Location;
  } catch (error) {
    console.error('S3 upload error:', error);
    throw error;
  }
};

// Delete from S3
const deleteFromS3 = async (url) => {
  try {
    if (!s3) {
      return false;
    }

    const key = url.split('/').slice(-2).join('/'); // Get folder/filename from URL
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    };

    await s3.deleteObject(params).promise();
    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    return false;
  }
};

// Main upload function - prioritizes Cloudinary > S3 > Local
const uploadImage = async (file, folder = 'profiles') => {
  // Priority: Cloudinary > S3 > Local
  if (cloudinary) {
    return await uploadToCloudinary(file, folder);
  } else if (s3) {
    return await uploadToS3(file, folder);
  } else {
    // Local storage (development only - not recommended for production)
    const origin = process.env.SERVER_PUBLIC_URL || process.env.CLIENT_URL?.replace('/api', '') || 'https://campus-connect-server-yqbh.onrender.com';
    return `${origin}/uploads/${file.filename}`;
  }
};

// Main delete function
const deleteImage = async (url) => {
  if (!url) return false;
  
  // Check if it's a Cloudinary URL
  if (url.includes('cloudinary.com')) {
    return await deleteFromCloudinary(url);
  }
  // Check if it's an S3 URL
  else if (url.includes('amazonaws.com')) {
    return await deleteFromS3(url);
  }
  // Local file (skip deletion for now as files are ephemeral on Render)
  else {
    return true; // Return true to avoid errors, file will be lost on server restart anyway
  }
};

// Middleware for single image upload
const uploadSingle = upload.single('image');

// Middleware for multiple images upload
const uploadMultiple = upload.array('images', 3);

// Middleware for profile image upload
const uploadProfileImage = upload.single('profileImage');

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        status: 'error',
        message: 'Too many files. Maximum is 5 files.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        status: 'error',
        message: 'Unexpected file field.'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      status: 'error',
      message: 'Only image files are allowed.'
    });
  }
  
  next(error);
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadProfileImage,
  uploadImage, // Main upload function (Cloudinary > S3 > Local)
  deleteImage, // Main delete function
  uploadToCloudinary,
  deleteFromCloudinary,
  uploadToS3,
  deleteFromS3,
  handleUploadError
};
