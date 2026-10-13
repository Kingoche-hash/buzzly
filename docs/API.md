# Buzzly API reference

Base address: `/api`. Everything except register, login and health needs the header `Authorization: Bearer <token>`.

- Errors look like `{ "message": "..." }`. Validation errors are `{ "message": "Validation failed", "errors": [{ "field", "message" }] }`.
- Lists use **cursor pagination**: send `before=<id>` and read `hasMore` and `nextCursor`.
- Common statuses: 400 invalid, 401 not logged in, 403 not allowed, 404 not found (also used to hide things you may not see), 409 conflict, 413 file too large, 415 wrong file type, 429 too many requests.

## Account and profile

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server and database status (no login) |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in (locked after 10 failed attempts) |
| GET | `/auth/me` | The logged-in user |
| PATCH | `/profile` | Display name, username, bio, status, privacy settings |
| POST | `/profile/avatar` | Upload a profile photo (multipart `avatar`) |
| DELETE | `/profile/avatar` | Remove the profile photo |
| POST | `/profile/password` | Change password (signs out other devices) |
| DELETE | `/profile` | Delete the account |
| GET | `/users?search=` | Find people (blocked people never appear) |
| GET | `/users/:userId` | A public profile |
| POST | `/users/:userId/report` | Report a person |

## Conversations and messages

| Method | Path | Description |
|---|---|---|
| POST | `/conversations` | Start a direct chat or create a group |
| GET | `/conversations` | My chats with unread counts and my private settings |
| GET | `/conversations/:id` | One chat |
| PATCH | `/conversations/:id/state` | Pin, mute, spam, delete, wallpaper (private to me) |
| POST | `/conversations/:id/wallpaper` | Use my own photo as the wallpaper |
| GET | `/conversations/:id/messages` | History. Use `before`, `after` or `around` with `limit` |
| POST | `/conversations/:id/messages` | Send text (also `replyTo`) |
| POST | `/conversations/:id/attachments` | Send files (multipart `files`, optional `content` and `replyTo`) |
| PATCH | `/conversations/:id/messages/:messageId` | Edit my message (within 15 minutes) |
| DELETE | `/conversations/:id/messages/:messageId?scope=me\|everyone` | Delete a message |
| PUT / DELETE | `/conversations/:id/messages/:messageId/reaction` | Set or remove my reaction |
| POST | `/conversations/:id/messages/:messageId/report` | Report a message |
| GET | `/search/messages` | Search with `q`, `conversationId`, `senderId`, `before` |

## Groups

| Method | Path | Description |
|---|---|---|
| PATCH | `/conversations/:id/group` | Rename (admins) |
| POST / DELETE | `/conversations/:id/group/avatar` | Set or remove the group photo (admins) |
| POST | `/conversations/:id/members` | Add members (admins, up to 50 per group) |
| DELETE | `/conversations/:id/members/:userId` | Remove a member (admins) |
| PUT / DELETE | `/conversations/:id/admins/:userId` | Make or remove an admin (admins) |
| POST | `/conversations/:id/leave` | Leave a group |

## Stories

| Method | Path | Description |
|---|---|---|
| GET | `/stories` | Stories of me and the people I chat with |
| POST | `/stories` | Post a text or photo story |
| POST | `/stories/:id/view` | Mark a story as seen |
| POST | `/stories/:id/reply` | Reply (arrives as a chat message) |
| GET | `/stories/:id/viewers` | Who viewed it (author only) |
| DELETE | `/stories/:id` | Delete my story |

## Posts

| Method | Path | Description |
|---|---|---|
| GET | `/posts` | The feed |
| POST | `/posts` | New post with up to 10 photos (multipart `images`, optional `caption`) |
| GET | `/posts/user/:userId` | One person's posts. Use `type=posts` or `type=reposts` |
| GET | `/posts/user/:userId/summary` | Their post and repost counts |
| GET / DELETE | `/posts/:postId` | One post, or delete mine |
| POST / DELETE | `/posts/:postId/like` | Like or unlike |
| POST / DELETE | `/posts/:postId/repost` | Repost or undo |
| POST | `/posts/:postId/share` | Send a post to up to 5 of my chats |
| GET / POST | `/posts/:postId/comments` | Read or add comments |
| DELETE | `/posts/:postId/comments/:commentId` | Delete a comment (writer or post owner) |
| POST | `/posts/:postId/report` | Report a post (hidden for everyone after 3 reports) |

## Friends and blocking

| Method | Path | Description |
|---|---|---|
| GET | `/friends` | Friends, incoming and outgoing requests, and my message setting |
| GET | `/friends/status/:userId` | none, outgoing, incoming or friends |
| POST | `/friends/requests/:userId` | Send a request (or accept if they already asked) |
| POST | `/friends/requests/:userId/accept` | Accept |
| POST | `/friends/requests/:userId/decline` | Decline |
| DELETE | `/friends/requests/:userId` | Cancel my request |
| DELETE | `/friends/:userId` | Unfriend |
| PATCH | `/friends/settings` | `whoCanMessage`: everyone or friends |
| GET | `/blocks` | My blocked users |
| POST / DELETE | `/blocks/:userId` | Block or unblock |

## Socket.io

Connect with `auth: { token }`. The server refuses connections with a missing, invalid or outdated token.

**Client to server** (acknowledged with `{ ok, ... }`)

| Event | Payload | Purpose |
|---|---|---|
| `send_message` | `conversationId, content, replyTo?` | Send a message |
| `join_conversation` / `leave_conversation` | `conversationId` | Join or leave a chat room (members only) |
| `typing_start` / `typing_stop` | `conversationId` | Typing indicator (never stored) |
| `message_delivered` / `message_read` | `conversationId, messageId` | Receipts up to a message |
| `get_presence` | none | Who is online right now |

**Server to client**

| Event | Meaning |
|---|---|
| `receive_message` | A new message (including group notes) |
| `message_updated` / `message_removed` | A message was edited, reacted to or deleted, or removed just for me |
| `messages_delivered` / `messages_read` | Receipts |
| `typing_start` / `typing_stop` | Someone is typing |
| `user_online` / `user_offline` | Presence changes |
| `profile_updated` | A contact changed their name or photo |
| `conversation_created` / `conversation_updated` / `conversation_removed` | Chats and groups appeared, changed or were left |
| `conversation_state` | My private chat settings changed in another window |
| `stories_changed`, `post_created` | Stories or posts changed |
| `friends_changed`, `blocks_changed` | Friendships or blocks changed |
