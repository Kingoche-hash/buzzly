import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/token.js';

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Not authenticated', 401);
  }

  const token = header.split(' ')[1];
  const payload = verifyToken(token);

  const user = await User.findById(payload.sub);

  // A deleted account can no longer use its old wristband.
  if (!user || user.deletedAt) {
    throw new AppError('User no longer exists', 401);
  }

  // A password change cancels every wristband handed out before it.
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }

  req.user = user;
  next();
};
