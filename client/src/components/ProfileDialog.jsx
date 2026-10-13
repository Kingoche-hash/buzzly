import { useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  changePasswordRequest,
  deleteAccountRequest,
  removeAvatarRequest,
  updateProfileRequest,
  uploadAvatarRequest,
} from '../services/profile.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

const STATUS_SUGGESTIONS = ['Available', 'Busy', 'At work', 'In a meeting', 'Away'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const inputClass =
  'w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500';
const primaryButton =
  'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50';
const tabClass = (selected) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
    selected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

function Notice({ notice }) {
  if (!notice) return null;

  return (
    <p
      role={notice.type === 'error' ? 'alert' : 'status'}
      className={`mt-3 text-sm ${notice.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}
    >
      {notice.text}
    </p>
  );
}

function ProfileTab() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [status, setStatus] = useState(user.status || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Runs a request that returns the updated user, and shows the result.
  const run = async (task, successText) => {
    setBusy(true);
    setNotice(null);

    try {
      updateUser(await task());
      setNotice({ type: 'success', text: successText });
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handlePhoto = (event) => {
    const file = event.target.files[0];
    event.target.value = '';

    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      setNotice({ type: 'error', text: 'Use a JPG, PNG or WEBP photo.' });
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setNotice({ type: 'error', text: 'That photo is larger than 10 MB.' });
      return;
    }

    run(() => uploadAvatarRequest(file), 'Photo updated.');
  };

  const handleSave = (event) => {
    event.preventDefault();
    run(() => updateProfileRequest({ displayName, username, bio, status }), 'Profile saved.');
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={getDisplayName(user)} src={user.avatar} size="xl" />
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handlePhoto}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className={primaryButton}
          >
            Change photo
          </button>
          {user.avatar && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(removeAvatarRequest, 'Photo removed.')}
              className="block text-sm text-slate-400 hover:text-red-400"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div>
          <label htmlFor="profile-display-name" className="mb-1 block text-sm">
            Display name
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="How people see you"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="profile-username" className="mb-1 block text-sm">
            Username
          </label>
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={30}
            required
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">Letters, numbers and underscores. People find you with it.</p>
        </div>

        <div>
          <label htmlFor="profile-bio" className="mb-1 block text-sm">
            About
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            placeholder="Tell people a little about yourself"
            className={inputClass}
          />
          <p className="mt-1 text-right text-xs text-slate-400">{bio.length}/160</p>
        </div>

        <div>
          <label htmlFor="profile-status" className="mb-1 block text-sm">
            Status
          </label>
          <input
            id="profile-status"
            type="text"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            maxLength={60}
            className={inputClass}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUS_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setStatus(suggestion)}
                className="rounded-full bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      <Notice notice={notice} />
    </div>
  );
}

const PRIVACY_OPTIONS = [
  {
    key: 'showPresence',
    title: 'Show when I am online and my last seen',
    text: 'If you turn this off, nobody sees your online status or last seen.',
  },
  {
    key: 'readReceipts',
    title: 'Read receipts',
    text: 'If you turn this off, people who write to you will not see blue ticks when you read.',
  },
  {
    key: 'typingIndicators',
    title: 'Typing indicators',
    text: 'If you turn this off, people will not see "is typing..." while you write.',
  },
];

function PrivacyTab() {
  const { user, updateUser } = useAuth();
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState(null);

  const toggle = async (key, checked) => {
    setBusyKey(key);
    setNotice(null);

    try {
      updateUser(await updateProfileRequest({ privacy: { [key]: checked } }));
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div>
      <ul className="space-y-4">
        {PRIVACY_OPTIONS.map((option) => (
          <li key={option.key}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={user.privacy?.[option.key] !== false}
                disabled={busyKey === option.key}
                onChange={(e) => toggle(option.key, e.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs text-slate-400">{option.text}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Notice notice={notice} />
    </div>
  );
}

function AccountTab() {
  const { user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState(null);

  const handlePassword = async (event) => {
    event.preventDefault();
    setPasswordNotice(null);

    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }

    setPasswordBusy(true);

    try {
      await changePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ type: 'success', text: 'Password changed.' });
    } catch (err) {
      setPasswordNotice({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleDelete = async () => {
    setConfirming(false);
    setDeleteNotice(null);

    try {
      await deleteAccountRequest(deletePassword);
      logout();
    } catch (err) {
      setDeleteNotice({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <p className="text-slate-400">Email</p>
        <p>{user.email}</p>
        {memberSince && (
          <>
            <p className="mt-2 text-slate-400">Member since</p>
            <p>{memberSince}</p>
          </>
        )}
      </div>

      <form onSubmit={handlePassword} className="space-y-3">
        <h3 className="font-medium">Change password</h3>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          aria-label="Current password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat the new password"
          aria-label="Repeat the new password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
        <p className="text-xs text-slate-400">At least 8 characters, with a letter and a number.</p>
        <button type="submit" disabled={passwordBusy} className={primaryButton}>
          {passwordBusy ? 'Saving...' : 'Change password'}
        </button>
        <Notice notice={passwordNotice} />
      </form>

      <div className="space-y-3 rounded-lg border border-red-500/40 p-4">
        <h3 className="font-medium text-red-400">Delete account</h3>
        <p className="text-xs text-slate-400">
          Your name, photo, About and email are erased and you can never log in again. Your old
          messages stay in other people's chats, shown as "Deleted user".
        </p>
        <input
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Your password"
          aria-label="Your password"
          autoComplete="current-password"
          className={inputClass}
        />
        <button
          type="button"
          disabled={!deletePassword}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete my account
        </button>
        <Notice notice={deleteNotice} />
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete your account?"
          message="This cannot be undone."
          confirmLabel="Yes, delete it"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export default function ProfileDialog({ onClose }) {
  const [tab, setTab] = useState('profile');

  return (
    <Modal title="Your profile" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setTab('profile')} className={tabClass(tab === 'profile')}>
          Profile
        </button>
        <button type="button" onClick={() => setTab('privacy')} className={tabClass(tab === 'privacy')}>
          Privacy
        </button>
        <button type="button" onClick={() => setTab('account')} className={tabClass(tab === 'account')}>
          Account
        </button>
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'account' && <AccountTab />}
    </Modal>
  );
}