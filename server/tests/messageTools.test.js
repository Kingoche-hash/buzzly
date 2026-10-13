import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Message from '../models/Message.js';
import MessageReport from '../models/MessageReport.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

describe('message tools: reply, edit, delete, react, report', () => {
  let alice;
  let bob;
  let carol;
  let chat;

  before(openTestDb);
  after(closeTestDb);

  beforeEach(async () => {
    await clearDatabase();
    alice = await makeUser('alice');
    bob = await makeUser('bob');
    carol = await makeUser('carol');
    chat = await startDirect(alice, bob);
  });

  const get = (user, path) => request(app).get(path).set(authHeader(user));
  const post = (user, path, body) => request(app).post(path).set(authHeader(user)).send(body);
  const del = (user, path) => request(app).delete(path).set(authHeader(user));
  const patch = (user, path, body) => request(app).patch(path).set(authHeader(user)).send(body);

  const url = (id, suffix = '') => `/api/conversations/${chat._id}/messages/${id}${suffix}`;
  const sendVia = (user, content, replyTo) =>
    post(user, `/api/conversations/${chat._id}/messages`, { content, replyTo });

  const send = async (user, content, replyTo) => {
    const res = await sendVia(user, content, replyTo);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.message;
  };

  const history = async (user) =>
    (await get(user, `/api/conversations/${chat._id}/messages`)).body.messages;

  const ghost = () => new mongoose.Types.ObjectId().toString();

  it('needs a login', async () => {
    assert.equal((await request(app).patch(url(ghost())).send({ content: 'x' })).status, 401);
    assert.equal((await request(app).delete(url(ghost(), '?scope=me'))).status, 401);
    assert.equal((await request(app).put(url(ghost(), '/reaction')).send({ emoji: '👍' })).status, 401);
  });

  // ---------------- replies ----------------

  it('replies to a message and remembers what it said', async () => {
    const original = await send(alice, 'original');
    const reply = await sendVia(bob, 'answer', original._id);

    assert.equal(reply.status, 201);
    assert.equal(reply.body.message.replyTo.message, original._id);
    assert.equal(reply.body.message.replyTo.text, 'original');
    assert.equal(reply.body.message.replyTo.senderName, 'alice');
  });

  it('refuses replies to messages from another chat, unknown messages and bad ids', async () => {
    const other = await startDirect(alice, carol);
    const foreign = (
      await post(alice, `/api/conversations/${other._id}/messages`, { content: 'elsewhere' })
    ).body.message;

    assert.equal((await sendVia(bob, 'x', foreign._id)).status, 404);
    assert.equal((await sendVia(bob, 'x', ghost())).status, 404);
    assert.equal((await sendVia(bob, 'x', '123')).status, 400);
  });

  it('refuses a reply to a message that was deleted for everyone', async () => {
    const original = await send(alice, 'secret');
    await del(alice, url(original._id, '?scope=everyone'));

    assert.equal((await sendVia(bob, 'x', original._id)).status, 404);
  });

  it('keeps the quote of a reply after the original is deleted', async () => {
    const original = await send(alice, 'original text');
    await sendVia(bob, 'answer', original._id);

    await del(alice, url(original._id, '?scope=everyone'));

    const messages = await history(bob);
    const answer = messages.find((message) => message.content === 'answer');
    assert.equal(answer.replyTo.text, 'original text');
  });

  // ---------------- editing ----------------

  it('edits my own message and marks it as edited', async () => {
    const sent = await send(alice, 'helo');

    const res = await patch(alice, url(sent._id), { content: 'hello' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message.content, 'hello');
    assert.ok(res.body.message.editedAt);

    const seenByBob = (await history(bob))[0];
    assert.equal(seenByBob.content, 'hello');
    assert.ok(seenByBob.editedAt);
  });

  it('does not mark a message as edited when nothing changed', async () => {
    const sent = await send(alice, 'same');

    const res = await patch(alice, url(sent._id), { content: 'same' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message.editedAt, null);
  });

  it("refuses editing someone else's message, empty text and unknown messages", async () => {
    const sent = await send(alice, 'mine');

    assert.equal((await patch(bob, url(sent._id), { content: 'hacked' })).status, 403);
    assert.equal((await patch(alice, url(sent._id), { content: '   ' })).status, 400);
    assert.equal((await patch(alice, url(ghost()), { content: 'x' })).status, 404);
  });

  it('refuses editing after 15 minutes', async () => {
    const sent = await send(alice, 'old');

    await Message.updateOne(
      { _id: sent._id },
      { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      { timestamps: false }
    );

    const res = await patch(alice, url(sent._id), { content: 'too late' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /15 minutes/);
  });

  it('refuses editing a deleted message', async () => {
    const sent = await send(alice, 'gone');
    await del(alice, url(sent._id, '?scope=everyone'));

    assert.equal((await patch(alice, url(sent._id), { content: 'back' })).status, 400);
  });

  // ---------------- deleting ----------------

  it('deletes a message just for me', async () => {
    const sent = await send(alice, 'hello');

    const res = await del(bob, url(sent._id, '?scope=me'));
    assert.equal(res.status, 200);
    assert.equal((await del(bob, url(sent._id, '?scope=me'))).status, 200); // twice is fine

    assert.equal((await history(bob)).length, 0);
    assert.equal((await history(alice)).length, 1);
    assert.equal((await del(bob, url(ghost(), '?scope=me'))).status, 404);
  });

  it('deletes my message for everyone and leaves a tombstone', async () => {
    const sent = await send(alice, 'oops');
    await post(bob, `/api/conversations/${chat._id}/messages`, { content: 'noise' });
    await request(app).put(url(sent._id, '/reaction')).set(authHeader(bob)).send({ emoji: '👍' });

    assert.equal((await del(bob, url(sent._id, '?scope=everyone'))).status, 403);

    const res = await del(alice, url(sent._id, '?scope=everyone'));
    assert.equal(res.status, 200);
    assert.ok(res.body.message.deletedAt);
    assert.equal(res.body.message.content, '');
    assert.deepEqual(res.body.message.reactions, []);

    for (const user of [alice, bob]) {
      const tombstone = (await history(user)).find((message) => message._id === sent._id);
      assert.ok(tombstone.deletedAt);
      assert.equal(tombstone.content, '');
    }
  });

  it('asks for a delete scope', async () => {
    const sent = await send(alice, 'hi');

    assert.equal((await del(alice, url(sent._id))).status, 400);
    assert.equal((await del(alice, url(sent._id, '?scope=nobody'))).status, 400);
  });

  it('shows the newest message I can still see in the chat list', async () => {
    await send(alice, 'm1');
    const second = await send(alice, 'm2');

    await del(bob, url(second._id, '?scope=me'));

    const bobList = (await get(bob, '/api/conversations')).body.conversations[0];
    assert.equal(bobList.lastMessage.content, 'm1');
    assert.equal(bobList.lastMessage.deletedFor, undefined);

    const aliceList = (await get(alice, '/api/conversations')).body.conversations[0];
    assert.equal(aliceList.lastMessage.content, 'm2');
  });

  it('does not count deleted messages as unread', async () => {
    const first = await send(alice, 'a');
    const second = await send(alice, 'b');

    const unread = async () => (await get(bob, '/api/conversations')).body.conversations[0].unreadCount;
    assert.equal(await unread(), 2);

    await del(bob, url(first._id, '?scope=me'));
    assert.equal(await unread(), 1);

    await del(alice, url(second._id, '?scope=everyone'));
    assert.equal(await unread(), 0);
  });

  it('leaves deleted messages out of the search', async () => {
    const first = await send(alice, 'project plan');
    const second = await send(alice, 'project budget');

    const found = async (user) => (await get(user, '/api/search/messages?q=project')).body.results.length;
    assert.equal(await found(bob), 2);

    await del(bob, url(first._id, '?scope=me'));
    assert.equal(await found(bob), 1);
    assert.equal(await found(alice), 2);

    await del(alice, url(second._id, '?scope=everyone'));
    assert.equal(await found(bob), 0);
    assert.equal(await found(alice), 1);
  });

  // ---------------- reactions ----------------

  it('reacts, replaces and removes a reaction', async () => {
    const sent = await send(alice, 'hi');
    const reaction = url(sent._id, '/reaction');
    const put = (user, emoji) => request(app).put(reaction).set(authHeader(user)).send({ emoji });

    const first = await put(bob, '👍');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.message.reactions, [{ user: bob.id, emoji: '👍' }]);

    const replaced = await put(bob, '😂');
    assert.deepEqual(replaced.body.message.reactions, [{ user: bob.id, emoji: '😂' }]);

    const both = await put(alice, '🙏');
    assert.equal(both.body.message.reactions.length, 2);

    const removed = await del(bob, reaction);
    assert.deepEqual(removed.body.message.reactions, [{ user: alice.id, emoji: '🙏' }]);

    const seen = (await history(bob))[0];
    assert.equal(seen.reactions.length, 1);
  });

  it('accepts the heart with or without its picture-style mark', async () => {
    const sent = await send(alice, 'hi');
    const res = await request(app)
      .put(url(sent._id, '/reaction'))
      .set(authHeader(bob))
      .send({ emoji: '\u2764' });

    assert.equal(res.status, 200);
    assert.equal(res.body.message.reactions[0].emoji, '\u2764\uFE0F');
  });

  it('refuses unknown reactions, reactions on deleted messages, and outsiders', async () => {
    const sent = await send(alice, 'hi');
    const reaction = url(sent._id, '/reaction');
    const put = (user, emoji) => request(app).put(reaction).set(authHeader(user)).send({ emoji });

    assert.equal((await put(bob, '🤡')).status, 400);
    assert.equal((await put(bob, 'abc')).status, 400);
    assert.equal((await put(carol, '👍')).status, 404);

    await del(alice, url(sent._id, '?scope=everyone'));
    assert.equal((await put(bob, '👍')).status, 400);
  });

  // ---------------- reports ----------------

  it('reports a message once per person and saves a copy of the text', async () => {
    const sent = await send(alice, 'rude words');
    const report = url(sent._id, '/report');

    assert.equal((await post(bob, report, { reason: 'harassment' })).status, 200);
    assert.equal((await post(bob, report, { reason: 'harassment' })).status, 200);
    assert.equal(await MessageReport.countDocuments({}), 1);

    // Editing or deleting afterwards cannot hide what was said.
    await del(alice, url(sent._id, '?scope=everyone'));
    const saved = await MessageReport.findOne({});
    assert.equal(saved.content, 'rude words');
    assert.equal(saved.reported.toString(), alice.id);
  });

  it('refuses bad message reports', async () => {
    const sent = await send(alice, 'hi');
    const report = url(sent._id, '/report');

    assert.equal((await post(alice, report, { reason: 'spam' })).status, 400); // your own message
    assert.equal((await post(bob, report, { reason: 'nonsense' })).status, 400);
    assert.equal((await post(carol, report, { reason: 'spam' })).status, 404); // not in this chat
  });

  // ---------------- blocked chats ----------------

  it('treats a blocked chat as missing for edits, reactions and deletes', async () => {
    const sent = await send(alice, 'hi');
    await post(bob, `/api/blocks/${alice.id}`, {});

    assert.equal((await patch(alice, url(sent._id), { content: 'x' })).status, 404);
    assert.equal(
      (await request(app).put(url(sent._id, '/reaction')).set(authHeader(alice)).send({ emoji: '👍' })).status,
      404
    );
    assert.equal((await del(alice, url(sent._id, '?scope=me'))).status, 404);
  });
});
