import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import {
  authHeader,
  clearDatabase,
  closeTestDb,
  makeUser,
  openTestDb,
  sendText,
  sleep,
  startDirect,
} from './helpers.js';

describe('conversations and messages', () => {
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

  const get = (user, url) => request(app).get(url).set(authHeader(user));

  it('does not create a second direct chat for the same two people', async () => {
    const again = await request(app)
      .post('/api/conversations')
      .set(authHeader(bob))
      .send({ type: 'direct', userId: alice.id });

    assert.equal(again.status, 200);
    assert.equal(again.body.conversation._id, chat._id);
  });

  it('refuses a chat with yourself', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set(authHeader(alice))
      .send({ type: 'direct', userId: alice.id });

    assert.equal(res.status, 400);
  });

  it('creates a group that includes the creator', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set(authHeader(alice))
      .send({ type: 'group', name: 'Team', memberIds: [bob.id, carol.id] });

    assert.equal(res.status, 201);
    assert.equal(res.body.conversation.members.length, 3);
  });

  it('refuses a group with a person who does not exist', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post('/api/conversations')
      .set(authHeader(alice))
      .send({ type: 'group', name: 'Team', memberIds: [ghost] });

    assert.equal(res.status, 404);
  });

  it('lists only my own conversations', async () => {
    const mine = await get(alice, '/api/conversations');
    assert.equal(mine.body.conversations.length, 1);
    assert.equal(mine.body.conversations[0].unreadCount, 0);
    assert.ok(mine.body.conversations[0].state);

    const strangers = await get(carol, '/api/conversations');
    assert.equal(strangers.body.conversations.length, 0);
  });

  it('keeps outsiders out of a chat', async () => {
    await sendText(alice, chat._id, 'private');

    assert.equal((await get(carol, `/api/conversations/${chat._id}`)).status, 404);
    assert.equal((await get(carol, `/api/conversations/${chat._id}/messages`)).status, 404);

    const write = await request(app)
      .post(`/api/conversations/${chat._id}/messages`)
      .set(authHeader(carol))
      .send({ content: 'sneaky' });
    assert.equal(write.status, 404);
  });

  it('sends and reads messages', async () => {
    await sendText(alice, chat._id, 'Hello Bob');

    const res = await get(bob, `/api/conversations/${chat._id}/messages`);

    assert.equal(res.status, 200);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].content, 'Hello Bob');
    assert.equal(res.body.messages[0].sender.username, 'alice');
  });

  it('rejects empty messages and malformed ids', async () => {
    const empty = await request(app)
      .post(`/api/conversations/${chat._id}/messages`)
      .set(authHeader(alice))
      .send({ content: '   ' });
    assert.equal(empty.status, 400);

    const badId = await get(alice, '/api/conversations/123');
    assert.equal(badId.status, 400);
  });

  it('counts unread messages for the other person only', async () => {
    await sendText(alice, chat._id, 'one');
    await sendText(alice, chat._id, 'two');

    const bobList = await get(bob, '/api/conversations');
    assert.equal(bobList.body.conversations[0].unreadCount, 2);

    const aliceList = await get(alice, '/api/conversations');
    assert.equal(aliceList.body.conversations[0].unreadCount, 0);
  });

  it('pages through history without loading everything', async () => {
    for (const text of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      await sendText(alice, chat._id, text);
    }

    const contents = (res) => res.body.messages.map((message) => message.content);

    const page1 = await get(bob, `/api/conversations/${chat._id}/messages?limit=2`);
    assert.deepEqual(contents(page1), ['m4', 'm5']);
    assert.equal(page1.body.hasMore, true);

    const page2 = await get(
      bob,
      `/api/conversations/${chat._id}/messages?limit=2&before=${page1.body.nextCursor}`
    );
    assert.deepEqual(contents(page2), ['m2', 'm3']);
    assert.equal(page2.body.hasMore, true);

    const page3 = await get(
      bob,
      `/api/conversations/${chat._id}/messages?limit=2&before=${page2.body.nextCursor}`
    );
    assert.deepEqual(contents(page3), ['m1']);
    assert.equal(page3.body.hasMore, false);
  });

  it('opens a window around one message and walks forward from it', async () => {
    const sent = [];
    for (const text of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      sent.push(await sendText(alice, chat._id, text));
    }

    const around = await get(
      bob,
      `/api/conversations/${chat._id}/messages?around=${sent[2]._id}&limit=4`
    );

    assert.deepEqual(
      around.body.messages.map((message) => message.content),
      ['m1', 'm2', 'm3', 'm4']
    );
    assert.equal(around.body.hasMore, false);
    assert.equal(around.body.hasNewer, true);

    const newer = await get(
      bob,
      `/api/conversations/${chat._id}/messages?after=${around.body.newerCursor}`
    );

    assert.deepEqual(
      newer.body.messages.map((message) => message.content),
      ['m5']
    );
    assert.equal(newer.body.hasNewer, false);
  });

  it('keeps each person\'s chat settings private', async () => {
    const patch = await request(app)
      .patch(`/api/conversations/${chat._id}/state`)
      .set(authHeader(alice))
      .send({ pinned: true, wallpaper: 'ocean' });
    assert.equal(patch.status, 200);

    const aliceList = await get(alice, '/api/conversations');
    assert.equal(aliceList.body.conversations[0].state.pinned, true);
    assert.equal(aliceList.body.conversations[0].state.wallpaper, 'ocean');

    const bobList = await get(bob, '/api/conversations');
    assert.equal(bobList.body.conversations[0].state.pinned, false);
    assert.equal(bobList.body.conversations[0].state.wallpaper, 'default');
  });

  it('rejects unknown wallpapers, empty changes and outsiders', async () => {
    const patch = (user, body) =>
      request(app).patch(`/api/conversations/${chat._id}/state`).set(authHeader(user)).send(body);

    assert.equal((await patch(alice, { wallpaper: 'neon' })).status, 400);
    assert.equal((await patch(alice, {})).status, 400);
    assert.equal((await patch(carol, { pinned: true })).status, 404);
  });

  it('brings a deleted chat back when a new message arrives', async () => {
    await request(app)
      .patch(`/api/conversations/${chat._id}/state`)
      .set(authHeader(alice))
      .send({ deleted: true });

    const hidden = await get(alice, '/api/conversations');
    assert.ok(hidden.body.conversations[0].state.deletedAt);

    await sendText(bob, chat._id, 'are you there?');
    await sleep(150);

    const back = await get(alice, '/api/conversations');
    assert.equal(back.body.conversations[0].state.deletedAt, null);
  });

  it('searches whole words, and only inside my own chats', async () => {
    await sendText(alice, chat._id, 'Project meeting tomorrow');

    const found = await get(bob, '/api/search/messages?q=project');
    assert.equal(found.status, 200);
    assert.equal(found.body.results.length, 1);

    const partial = await get(bob, '/api/search/messages?q=proj');
    assert.equal(partial.body.results.length, 0);

    const stranger = await get(carol, '/api/search/messages?q=project');
    assert.equal(stranger.body.results.length, 0);

    const forbidden = await get(carol, `/api/search/messages?q=project&conversationId=${chat._id}`);
    assert.equal(forbidden.status, 404);

    const tooShort = await get(bob, '/api/search/messages?q=a');
    assert.equal(tooShort.status, 400);
  });
});
