import path from 'path';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { MAX_FILE_SIZE } from '../utils/uploadRules.js';

const ALLOWED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

// Post photos: one picture, JPG, PNG or WEBP only.
const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED[file.mimetype]?.includes(extension)) {
    return cb(new AppError('Use a JPG, PNG or WEBP photo', 415));
  }

  cb(null, true);
};

export const uploadPostImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter,
}).single('image');
