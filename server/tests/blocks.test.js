import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Block from '../models/Block.js';
import Post from '../models/Post.js';
import UserReport from '../models/UserReport.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sendText, startDirect } from './helpers.js';

const makePost = (author, caption = 'Hello') =>
  Post.create({
    author: author.id,
    caption,
    images: [
      { url: 'https://res.cloudinary.com/test/image/upload/v1/sample.jpg', publicId: '', width: 800, height: 1000 },
    ],
  });

describe('blocking and reporting people', () => {
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
  const post = (user, url, body) => request(app).post(url).set(authHeader(user)).send(body);
  const del = (user, url) => request(app).delete(url).set(authHeader(user));
  const captions = (res) => res.body.posts.map((item) => item.caption);

  it('needs a login', async () => {
    assert.equal((await request(app).get('/api/blocks')).status, 401);
    assert.equal((await request(app).post(`/api/blocks/${bob.id}`)).status, 401);
  });

  it('blocks, lists and unblocks', async () => {
    assert.equal((await post(alice, `/api/blocks/${bob.id}`)).status, 200);
    assert.equal((await post(alice, `/api/blocks/${bob.id}`)).status, 200); // twice is fine

    const list = await get(alice, '/api/blocks');
    assert.equal(list.body.users.length, 1);
    assert.equal(list.body.users[0].username, 'bob');

    // The blocked person has an empty list: only my own blocks are shown to me.
    assert.equal((await get(bob, '/api/blocks')).body.users.length, 0);

    assert.equal((await del(alice, `/api/blocks/${bob.id}`)).status, 200);
    assert.equal((await del(alice, `/api/blocks/${bob.id}`)).status, 200);
    assert.equal((await get(alice, '/api/blocks')).body.users.length, 0);
  });

  it('refuses blocking yourself, unknown people and bad ids', async () => {
    assert.equal((await post(alice, `/api/blocks/${alice.id}`)).status, 400);
    assert.equal((await post(alice, `/api/blocks/${new mongoose.Types.ObjectId()}`)).status, 404);
    assert.equal((await post(alice, '/api/blocks/123')).status, 400);
  });

  it('hides the direct chat from both people, and brings it back after unblocking', async () => {
    await sendText(alice, chat._id, 'before');
    await post(alice, `/api/blocks/${bob.id}`);

    for (const user of [alice, bob]) {
      assert.equal((await get(user, '/api/conversations')).body.conversations.length, 0);
      assert.equal((await get(user, `/api/conversations/${chat._id}`)).status, 404);
      assert.equal((await get(user, `/api/conversations/${chat._id}/messages`)).status, 404);
      assert.equal((await post(user, `/api/conversations/${chat._id}/messages`, { content: 'hi' })).status, 404);
    }

    await del(alice, `/api/blocks/${bob.id}`);

    for (const user of [alice, bob]) {
      assert.equal((await get(user, '/api/conversations')).body.conversations.length, 1);
    }

    const history = await get(bob, `/api/conversations/${chat._id}/messages`);
    assert.deepEqual(history.body.messages.map((message) => message.content), ['before']);
  });

  it('stops new chats between blocked people', async () => {
    await post(alice, `/api/blocks/${carol.id}`);

    const byBlocker = await post(alice, '/api/conversations', { type: 'direct', userId: carol.id });
    assert.equal(byBlocker.status, 403);

    // The blocked person just sees a missing account.
    const byBlocked = await post(carol, '/api/conversations', { type: 'direct', userId: alice.id });
    assert.equal(byBlocked.status, 404);
  });

  it('keeps shared groups working', async () => {
    const group = await post(carol, '/api/conversations', {
      type: 'group',
      name: 'Team',
      memberIds: [alice.id, bob.id],
    });
    assert.equal(group.status, 201);

    await post(alice, `/api/blocks/${bob.id}`);

    for (const user of [alice, bob, carol]) {
      const groups = (await get(user, '/api/conversations')).body.conversations.filter(
        (conversation) => conversation.type === 'group'
      );
      assert.equal(groups.length, 1);
    }

    const sent = await post(alice, `/api/conversations/${group.body.conversation._id}/messages`, {
      content: 'hi all',
    });
    assert.equal(sent.status, 201);
  });

  it('hides people from the user search, both ways', async () => {
    await post(alice, `/api/blocks/${bob.id}`);

    assert.equal((await get(alice, '/api/users?search=bob')).body.users.length, 0);
    assert.equal((await get(bob, '/api/users?search=alice')).body.users.length, 0);
    assert.equal((await get(carol, '/api/users?search=bob')).body.users.length, 1);
  });

  it('shows a blocker a small blocked card, and the blocked person a missing account', async () => {
    await post(alice, `/api/blocks/${bob.id}`);

    const blockerView = await get(alice, `/api/users/${bob.id}`);
    assert.equal(blockerView.status, 200);
    assert.equal(blockerView.body.user.blockedByMe, true);
    assert.equal(blockerView.body.user.bio, undefined);

    assert.equal((await get(bob, `/api/users/${alice.id}`)).status, 404);

    await del(alice, `/api/blocks/${bob.id}`);
    assert.equal((await get(alice, `/api/users/${bob.id}`)).body.user.blockedByMe, false);
    assert.equal((await get(bob, `/api/users/${alice.id}`)).status, 200);
  });

  it('hides posts both ways, and refuses likes, comments and reposts across a block', async () => {
    const alicePost = await makePost(alice, 'from alice');
    const bobPost = await makePost(bob, 'from bob');
    await makePost(carol, 'from carol');

    await post(alice, `/api/blocks/${bob.id}`);

    assert.deepEqual(captions(await get(alice, '/api/posts')), ['from carol', 'from alice']);
    assert.deepEqual(captions(await get(bob, '/api/posts')), ['from carol', 'from bob']);
    assert.equal((await get(carol, '/api/posts')).body.posts.length, 3);

    assert.equal((await get(alice, `/api/posts/user/${bob.id}`)).body.posts.length, 0);
    assert.equal((await get(bob, `/api/posts/user/${alice.id}`)).body.posts.length, 0);

    assert.equal((await get(alice, `/api/posts/${bobPost._id}`)).status, 404);
    assert.equal((await post(alice, `/api/posts/${bobPost._id}/like`)).status, 404);
    assert.equal((await post(alice, `/api/posts/${bobPost._id}/comments`, { text: 'hi' })).status, 404);
    assert.equal((await post(alice, `/api/posts/${bobPost._id}/repost`)).status, 404);
    assert.equal((await post(bob, `/api/posts/${alicePost._id}/like`)).status, 404);
  });

  it('hides comments written by a blocked person', async () => {
    const carolPost = await makePost(carol);

    await post(bob, `/api/posts/${carolPost._id}/comments`, { text: 'from bob' });
    await post(alice, `/api/blocks/${bob.id}`);

    assert.equal((await get(alice, `/api/posts/${carolPost._id}/comments`)).body.comments.length, 0);
    assert.equal((await get(carol, `/api/posts/${carolPost._id}/comments`)).body.comments.length, 1);
  });

  it('hides stories both ways and refuses story replies', async () => {
    const posted = await post(alice, '/api/stories', { text: 'hi there' });
    assert.equal(posted.status, 201);

    const seenBefore = await get(bob, '/api/stories');
    assert.ok(seenBefore.body.groups.some((group) => group.author._id === alice.id));

    await post(alice, `/api/blocks/${bob.id}`);

    const seenAfter = await get(bob, '/api/stories');
    assert.equal(seenAfter.body.groups.some((group) => group.author._id === alice.id), false);

    const storyId = posted.body.story._id;
    assert.equal((await post(bob, `/api/stories/${storyId}/reply`, { content: 'nice' })).status, 404);
    assert.equal((await post(bob, `/api/stories/${storyId}/view`)).status, 404);
  });

  it('leaves blocked chats out of message search', async () => {
    await sendText(alice, chat._id, 'project plan');

    assert.equal((await get(bob, '/api/search/messages?q=project')).body.results.length, 1);

    await post(alice, `/api/blocks/${bob.id}`);

    assert.equal((await get(bob, '/api/search/messages?q=project')).body.results.length, 0);
    assert.equal((await get(alice, '/api/search/messages?q=project')).body.results.length, 0);
  });

  it('removes the blocks of a deleted account', async () => {
    await post(alice, `/api/blocks/${bob.id}`);

    const gone = await del(bob, '/api/profile').send({ password: bob.password });
    assert.equal(gone.status, 200);

    assert.equal(await Block.countDocuments({}), 0);
    assert.deepEqual((await get(alice, '/api/blocks')).body.users, []);
  });

  it('reports a person, once per reporter', async () => {
    const url = `/api/users/${bob.id}/report`;

    assert.equal((await post(alice, url, { reason: 'spam', details: 'sends links' })).status, 200);
    assert.equal((await post(alice, url, { reason: 'spam' })).status, 200);
    assert.equal(await UserReport.countDocuments({ reported: bob.id }), 1);

    assert.equal((await post(carol, url, { reason: 'harassment' })).status, 200);
    assert.equal(await UserReport.countDocuments({ reported: bob.id }), 2);
  });

  it('refuses bad reports', async () => {
    const url = `/api/users/${bob.id}/report`;

    assert.equal((await post(alice, url, { reason: 'nonsense' })).status, 400);
    assert.equal((await post(alice, url, { reason: 'spam', details: 'x'.repeat(301) })).status, 400);
    assert.equal((await post(alice, `/api/users/${alice.id}/report`, { reason: 'spam' })).status, 400);
    assert.equal(
      (await post(alice, `/api/users/${new mongoose.Types.ObjectId()}/report`, { reason: 'spam' })).status,
      404
    );
  });
});
