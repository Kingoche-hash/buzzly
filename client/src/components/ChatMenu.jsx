import { useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useToast } from '../hooks/useToast';
import { getDisplayName } from '../utils/conversation';
import { getState, isMuted } from '../utils/conversationFilters';
import Avatar from './Avatar';
import ConfirmDialog from './confirmDialog';
import Modal from './Modal';
import UserProfileDialog from './UserProfileDialog';
import { blockUserRequest } from '../services/block.service';
import WallpaperPicker from './WallpaperPicker';

function MenuItem({ icon, onClick, danger = false, children }) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700 ${
          danger ? 'text-red-400' : ''
        }`}
      >
        <span aria-hidden="true">{icon}</span>
        {children}
      </button>
    </li>
  );
}

// The "..." menu at the top right of a chat.
export default function ChatMenu({ conversation, currentUserId, onUpdate, onLeave, onStartChat }) {
  const { showToast } = useToast();

  const state = getState(conversation);
  const muted = isMuted(conversation);

  // In a direct chat: the other person (the one I can block).
  const otherPerson =
    conversation.type === 'direct'
      ? conversation.members.find((member) => member._id !== currentUserId)
      : null;

  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'delete' | 'wallpaper' | 'members' | null
  const [profileId, setProfileId] = useState(null);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setOpen(false), open);

  // Saves a change, then closes the menu. `leave` also closes the chat (after delete or spam).
  const apply = async (patch, { leave = false } = {}) => {
    setOpen(false);
    setDialog(null);

    try {
      await onUpdate(patch);
      if (leave) onLeave();
    } catch {
      showToast({ title: 'Could not save the change', text: 'Please try again.' });
    }
  };

  const handleBlock = async () => {
    setDialog(null);

    try {
      await blockUserRequest(otherPerson._id);
      onLeave();
      showToast({ title: 'Blocked', text: getDisplayName(otherPerson) + ' can no longer reach you.' });
    } catch {
      showToast({ title: 'Could not block', text: 'Please try again.' });
    }
  };

  // Uploads a photo and keeps the picker open (with progress) until it is done.
  const choosePhoto = async (file) => {
    await onUpdate({ wallpaperFile: file });
    setDialog(null);
  };

  return (
    <div ref={menuRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chat options"
        className="rounded-lg px-3 py-1 text-lg hover:bg-slate-700"
      >
        ⋯
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-600 bg-slate-800 py-1 shadow-xl"
        >
          <MenuItem icon="📌" onClick={() => apply({ pinned: !state.pinned })}>
            {state.pinned ? 'Unpin chat' : 'Pin chat'}
          </MenuItem>

          {muted ? (
            <MenuItem icon="🔔" onClick={() => apply({ muted: 'off' })}>
              Unmute
            </MenuItem>
          ) : (
            <>
              <MenuItem icon="🔕" onClick={() => apply({ muted: '8h' })}>
                Mute for 8 hours
              </MenuItem>
              <MenuItem icon="🔕" onClick={() => apply({ muted: '1w' })}>
                Mute for 1 week
              </MenuItem>
              <MenuItem icon="🔕" onClick={() => apply({ muted: 'forever' })}>
                Mute forever
              </MenuItem>
            </>
          )}

          <MenuItem
            icon="🖼️"
            onClick={() => {
              setOpen(false);
              setDialog('wallpaper');
            }}
          >
            Change wallpaper
          </MenuItem>

          {conversation.type === 'group' && (
            <MenuItem
              icon="👥"
              onClick={() => {
                setOpen(false);
                setDialog('members');
              }}
            >
              Members
            </MenuItem>
          )}

          <MenuItem icon="🚫" onClick={() => apply({ spam: !state.spam }, { leave: !state.spam })}>
            {state.spam ? 'Not spam' : 'Report as spam'}
          </MenuItem>

          {otherPerson && (
            <MenuItem
              icon="⛔"
              danger
              onClick={() => {
                setOpen(false);
                setDialog('block');
              }}
            >
              Block {getDisplayName(otherPerson)}
            </MenuItem>
          )}

          <MenuItem
            icon="🗑️"
            danger
            onClick={() => {
              setOpen(false);
              setDialog('delete');
            }}
          >
            Delete chat
          </MenuItem>
        </ul>
      )}

      {dialog === 'block' && otherPerson && (
        <ConfirmDialog
          title={'Block ' + getDisplayName(otherPerson) + '?'}
          message="They won't be able to message you, find you, or see your profile, posts, stories or when you are online. This chat will be hidden. You can unblock them any time from your profile."
          confirmLabel="Block"
          danger
          onConfirm={handleBlock}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete this chat?"
          message="It moves to Recently deleted for 30 days, where you can recover it. Other people keep their copy. A new message brings the chat back."
          confirmLabel="Delete chat"
          danger
          onConfirm={() => apply({ deleted: true }, { leave: true })}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'wallpaper' && (
        <WallpaperPicker
          current={state.wallpaper}
          photoUrl={conversation.state?.wallpaperUrl}
          onChoose={(key) => apply({ wallpaper: key })}
          onChoosePhoto={choosePhoto}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'members' && (
        <Modal title={`Members (${conversation.members.length})`} onClose={() => setDialog(null)}>
          <ul className="space-y-1">
            {conversation.members.map((member) => (
              <li key={member._id}>
                <button
                  type="button"
                  onClick={() => {
                    setDialog(null);
                    setProfileId(member._id);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-700"
                >
                  <Avatar name={getDisplayName(member)} src={member.avatar} size="sm" />
                  <span className="truncate">
                    {getDisplayName(member)}
                    {member._id === currentUserId && <span className="text-slate-400"> (you)</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {profileId && (
        <UserProfileDialog
          userId={profileId}
          onClose={() => setProfileId(null)}
          onMessage={onStartChat}
        />
      )}
    </div>
  );
}