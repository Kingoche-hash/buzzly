import { getPublicProfile, searchUsers } from '../services/user.service.js';

export const searchUsersHandler = async (req, res) => {
  const { search, limit } = req.valid.query;
  const users = await searchUsers({ search, limit, currentUserId: req.user._id });
  res.status(200).json({ users });
};

export const getUserProfileHandler = async (req, res) => {
  const user = await getPublicProfile(req.params.userId, req.user._id);
  res.status(200).json({ user });
};
