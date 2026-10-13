import { lazy, Suspense, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import {
  leaveGroupRequest,
  makeAdminRequest,
  removeAdminRequest,
  removeGroupAvatarRequest,
  removeMemberRequest,
  renameGroupRequest,
  uploadGroupAvatarRequest,
} from '../services/group.service';
import { getDisplayName } from '../utils/conversation';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getAdminIds } from '../utils/group';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

const AddMembersDialog = lazy(() => import('./AddMembersDialog'));

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const smallButton = 'rounded-lg bg-slate-700 px-3 py-1 text-xs font-medium hover:bg-slate-600 disabled:opacity-60';

// A group's page: photo, name, members with their roles, and (for admins) the tools to manage them.
export default function GroupInfoDialog({ conversation, currentUserId, onLeave, onClose }) {
  const { showToast } = useToast();

  const admins = getAdminIds(conversation);
  const iAmAdmin = admins.has(currentUserId);

  const [name, setName] = useState(conversation.name || '');
  const [busy, setBusy] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [dialog, setDialog] = useState(null); // 'add' | 'leave' | { remove: member } | null
  const fileInputRef = useRef(null);

  const trimmed = name.trim();
  const nameChanged = trimmed.length > 0 && trimmed !== conversation.name;

  // Runs one action. If it fails, a message explains why.
  const run = async (key, task, success) => {
    setBusy(key);

    try {
      await task();
      if (success) showToast(success);
    } catch (err) {
      showToast({ title: 'Something went wrong', text: getErrorMessage(err) });
    } finally {
      setBusy('');
    }
  };

  const handleFile = (event) => {
    const file = event.target.files[0];
    event.target.value = '';

    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      showToast({ title: 'Wrong file type', text: 'Use a JPG, PNG or WEBP photo.' });
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      showToast({ title: 'Photo too large', text: 'That photo is larger than 10 MB.' });
      return;
    }

    run('photo', () => uploadGroupAvatarRequest(conversation._id, file));
  };

  const handleLeave = async () => {
    setDialog(null);
    setBusy('leave');

    try {
      await leaveGroupRequest(conversation._id);
      onClose();
      onLeave();
    } catch (err) {
      showToast({ title: 'Could not leave', text: getErrorMessage(err) });
      setBusy('');
    }
  };

  // Admins first, then everyone else by name.
  const members = [...conversation.members].sort((a, b) => {
    const byRole = Number(admins.has(b._id)) - Number(admins.has(a._id));
    return byRole || getDisplayName(a).localeCompare(getDisplayName(b));
  });

  return (
    <Modal title="Group info" onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <Avatar name={conversation.name || 'Group'} src={conversation.avatar} size="xl" />

        {iAmAdmin && (
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy === 'photo'}
              onClick={() => fileInputRef.current?.click()}
              className={smallButton}
            >
              {busy === 'photo' ? 'Uploading...' : '📷 Change photo'}
            </button>
            {conversation.avatar && (
              <button
                type="button"
                disabled={busy === 'photo'}
                onClick={() => run('photo', () => removeGroupAvatarRequest(conversation._id))}
                className={smallButton}
              >
                Remove
              </button>
            )}
          </div>
        )}

        {iAmAdmin ? (
          <form
            className="flex w-full gap-2"
            onSubmit={(event) => {
              event.preventDefault();

              if (nameChanged) {
                run('name', () => renameGroupRequest(conversation._id, trimmed), {
                  title: 'Saved',
                  text: 'The group name was changed.',
                });
              }
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              aria-label="Group name"
              className="min-w-0 flex-1 rounded-lg bg-slate-700 px-3 py-2 text-center font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {nameChanged && (
              <button
                type="submit"
                disabled={busy === 'name'}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy === 'name' ? '...' : 'Save'}
              </button>
            )}
          </form>
        ) : (
          <h3 className="break-words text-center text-lg font-semibold">{conversation.name}</h3>
        )}

        <p className="text-sm text-slate-400">{conversation.members.length} members</p>
      </div>

      {iAmAdmin && (
        <button
          type="button"
          onClick={() => setDialog('add')}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold hover:bg-emerald-500"
        >
          ＋ Add members
        </button>
      )}

      <ul className="mt-4 space-y-1">
        {members.map((member) => {
          const isMe = member._id === currentUserId;
          const memberIsAdmin = admins.has(member._id);

          return (
            <li key={member._id}>
              <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-700/60">
                <Link to={`/u/${member._id}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={getDisplayName(member)} src={member.avatar} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {getDisplayName(member)}
                      {isMe && <span className="text-slate-400"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-400">@{member.username}</span>
                  </span>
                </Link>

                {memberIsAdmin && (
                  <span className="shrink-0 rounded-full bg-emerald-700/50 px-2 py-0.5 text-xs">Admin</span>
                )}

                {iAmAdmin && !isMe && (
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === member._id ? null : member._id)}
                    aria-label={`Options for ${getDisplayName(member)}`}
                    aria-expanded={menuFor === member._id}
                    className="shrink-0 rounded-lg px-2 py-1 hover:bg-slate-700"
                  >
                    ⋯
                  </button>
                )}
              </div>

              {menuFor === member._id && (
                <div className="mb-2 ml-12 flex flex-wrap gap-2">
                  {!memberIsAdmin && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setMenuFor(null);
                        run(
                          member._id,
                          () => makeAdminRequest(conversation._id, member._id),
                          { title: 'Done', text: `${getDisplayName(member)} is now an admin.` }
                        );
                      }}
                      className={smallButton}
                    >
                      Make admin
                    </button>
                  )}

                  {memberIsAdmin && member._id !== conversation.createdBy && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setMenuFor(null);
                        run(
                          member._id,
                          () => removeAdminRequest(conversation._id, member._id),
                          { title: 'Done', text: `${getDisplayName(member)} is no longer an admin.` }
                        );
                      }}
                      className={smallButton}
                    >
                      Remove admin
                    </button>
                  )}

                  {!memberIsAdmin && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setMenuFor(null);
                        setDialog({ remove: member });
                      }}
                      className="rounded-lg bg-red-950 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900 disabled:opacity-60"
                    >
                      Remove from group
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={busy === 'leave'}
        onClick={() => setDialog('leave')}
        className="mt-5 w-full rounded-lg bg-red-950 py-2 text-sm font-semibold text-red-300 hover:bg-red-900 disabled:opacity-60"
      >
        🚪 Leave group
      </button>

      <Suspense fallback={null}>
        {dialog === 'add' && <AddMembersDialog conversation={conversation} onClose={() => setDialog(null)} />}
      </Suspense>

      {dialog === 'leave' && (
        <ConfirmDialog
          title="Leave this group?"
          message="You will stop receiving its messages. An admin can add you back."
          confirmLabel="Leave group"
          danger
          onConfirm={handleLeave}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.remove && (
        <ConfirmDialog
          title={`Remove ${getDisplayName(dialog.remove)}?`}
          message="They will lose access to this group straight away."
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            const member = dialog.remove;
            setDialog(null);
            run(member._id, () => removeMemberRequest(conversation._id, member._id), {
              title: 'Removed',
              text: `${getDisplayName(member)} is no longer in the group.`,
            });
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </Modal>
  );
}
