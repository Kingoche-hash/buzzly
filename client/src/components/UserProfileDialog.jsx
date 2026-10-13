import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Someone's profile now lives on its own page (/u/:userId).
// Anything that used to open the small profile window is sent there instead.
export default function UserProfileDialog({ userId, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/u/${userId}`);
    onClose?.();
  }, [navigate, onClose, userId]);

  return null;
}
