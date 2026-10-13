import path from 'path';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { MAX_FILE_SIZE } from '../utils/uploadRules.js';

const ALLOWED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

// Post photos: up to 10 pictures, JPG, PNG or WEBP only.
const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED[file.mimetype]?.includes(extension)) {
    return cb(new AppError('Use JPG, PNG or WEBP photos', 415));
  }

  cb(null, true);
};

export const uploadPostImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter,
}).array('images', 10);
