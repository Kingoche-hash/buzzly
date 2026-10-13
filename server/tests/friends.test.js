import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Friendship from '../models/Friendship.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sendText, startDirect } from './helpers.js';

describe('friends and who can message me', () => {
  let alice;
  let bob;
  let carol;

  before(openTestDb);
  after(closeTestDb);

  beforeEach(async () => {
    await clearDatabase();
    alice = await makeUser('alice');
    bob = await makeUser('bob');
    carol = await makeUser('carol');
  });

  const get = (user, url) => request(app).get(url).set(authHeader(user));
  const post = (user, url, body) => request(app).post(url).set(authHeader(user)).send(body);
  const del = (user, url) => request(app).delete(url).set(authHeader(user));
  const patch = (user, url, body) => request(app).patch(url).set(authHeader(user)).send(body);
  const names = (list) => list.map((person) => person.username);

  const befriend = async (a, b) => {
    await post(a, `/api/friends/requests/${b.id}`);
    const res = await post(b, `/api/friends/requests/${a.id}/accept`);
    assert.equal(res.status, 200);
  };

  it('needs a login', async () => {
    assert.equal((await request(app).get('/api/friends')).status, 401);
    assert.equal((await request(app).post(`/api/friends/requests/${bob.id}`)).status, 401);
  });

  it('sends a request, shows it to both people, and lets the sender cancel it', async () => {
    const sent = await post(alice, `/api/friends/requests/${bob.id}`);
    assert.equal(sent.status, 200);
    assert.equal(sent.body.status, 'outgoing');

    // Asking twice changes nothing.
    assert.equal((await post(alice, `/api/friends/requests/${bob.id}`)).body.status, 'outgoing');
    assert.equal(await Friendship.countDocuments({}), 1);

    const aliceView = (await get(alice, '/api/friends')).body;
    assert.deepEqual(names(aliceView.outgoing), ['bob']);
    assert.equal(aliceView.incoming.length, 0);

    const bobView = (await get(bob, '/api/friends')).body;
    assert.deepEqual(names(bobView.incoming), ['alice']);
    assert.equal(bobView.outgoing.length, 0);

    assert.equal((await get(alice, `/api/friends/status/${bob.id}`)).body.status, 'outgoing');
    assert.equal((await get(bob, `/api/friends/status/${alice.id}`)).body.status, 'incoming');

    const cancelled = await del(alice, `/api/friends/requests/${bob.id}`);
    assert.equal(cancelled.body.status, 'none');
    assert.equal((await get(bob, '/api/friends')).body.incoming.length, 0);
  });

  it('becomes a friendship when the other person accepts', async () => {
    await post(alice, `/api/friends/requests/${bob.id}`);

    const accepted = await post(bob, `/api/friends/requests/${alice.id}/accept`);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'friends');

    assert.deepEqual(names((await get(alice, '/api/friends')).body.friends), ['bob']);
    assert.deepEqual(names((await get(bob, '/api/friends')).body.friends), ['alice']);
    assert.equal((await get(alice, `/api/friends/status/${bob.id}`)).body.status, 'friends');
    assert.equal((await get(bob, `/api/friends/status/${alice.id}`)).body.status, 'friends');
  });

  it('only lets the person who was asked accept', async () => {
    await post(alice, `/api/friends/requests/${bob.id}`);

    assert.equal((await post(alice, `/api/friends/requests/${bob.id}/accept`)).status, 404);
    assert.equal((await post(carol, `/api/friends/requests/${alice.id}/accept`)).status, 404);
    assert.equal((await get(alice, `/api/friends/status/${bob.id}`)).body.status, 'outgoing');
  });

  it('lets a request be declined, and asked again later', async () => {
    await post(alice, `/api/friends/requests/${bob.id}`);

    const declined = await post(bob, `/api/friends/requests/${alice.id}/decline`);
    assert.equal(declined.body.status, 'none');
    assert.equal((await get(alice, '/api/friends')).body.outgoing.length, 0);

    assert.equal((await post(alice, `/api/friends/requests/${bob.id}`)).body.status, 'outgoing');
  });

  it('makes two people friends at once when they ask each other', async () => {
    await post(alice, `/api/friends/requests/${bob.id}`);

    const answer = await post(bob, `/api/friends/requests/${alice.id}`);
    assert.equal(answer.body.status, 'friends');
    assert.equal(await Friendship.countDocuments({ status: 'accepted' }), 1);
  });

  it('unfriends, and unfriending a non-friend is harmless', async () => {
    await befriend(alice, bob);

    assert.equal((await del(alice, `/api/friends/${bob.id}`)).body.status, 'none');
    assert.equal((await get(alice, '/api/friends')).body.friends.length, 0);
    assert.equal((await get(bob, '/api/friends')).body.friends.length, 0);

    assert.equal((await del(alice, `/api/friends/${carol.id}`)).status, 200);
  });

  it('refuses yourself, unknown people and bad ids', async () => {
    assert.equal((await post(alice, `/api/friends/requests/${alice.id}`)).status, 400);
    assert.equal((await post(alice, `/api/friends/requests/${new mongoose.Types.ObjectId()}`)).status, 404);
    assert.equal((await post(alice, '/api/friends/requests/123')).status, 400);
  });

  it('refuses requests between blocked people, and blocking ends a friendship and pending requests', async () => {
    await befriend(alice, bob);
    await post(alice, `/api/friends/requests/${carol.id}`);

    await post(alice, `/api/blocks/${bob.id}`);
    await post(carol, `/api/blocks/${alice.id}`);

    assert.equal(await Friendship.countDocuments({}), 0);

    assert.equal((await post(alice, `/api/friends/requests/${bob.id}`)).status, 404);
    assert.equal((await post(bob, `/api/friends/requests/${alice.id}`)).status, 404);
    assert.equal((await post(alice, `/api/friends/requests/${carol.id}`)).status, 404);
  });

  it('starts everyone on "everyone" and saves the setting', async () => {
    assert.equal((await get(alice, '/api/friends')).body.settings.whoCanMessage, 'everyone');

    const saved = await patch(alice, '/api/friends/settings', { whoCanMessage: 'friends' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.whoCanMessage, 'friends');
    assert.equal((await get(alice, '/api/friends')).body.settings.whoCanMessage, 'friends');

    assert.equal((await patch(alice, '/api/friends/settings', { whoCanMessage: 'nobody' })).status, 400);
    assert.equal((await patch(alice, '/api/friends/settings', {})).status, 400);
  });

  it('friends only: strangers cannot start a chat, friends can', async () => {
    await patch(bob, '/api/friends/settings', { whoCanMessage: 'friends' });

    const refused = await post(carol, '/api/conversations', { type: 'direct', userId: bob.id });
    assert.equal(refused.status, 403);
    assert.match(refused.body.message, /friends/);

    await befriend(carol, bob);
    assert.equal((await post(carol, '/api/conversations', { type: 'direct', userId: bob.id })).status, 201);

    // Someone who set "friends only" can still start a chat with people who accept everyone.
    assert.equal((await post(bob, '/api/conversations', { type: 'direct', userId: alice.id })).status, 201);
  });

  it('friends only: an existing chat stays, but a stranger cannot keep writing unless they were written to first', async () => {
    const chat = await startDirect(alice, bob);
    await sendText(alice, chat._id, 'hello before');

    await patch(bob, '/api/friends/settings', { whoCanMessage: 'friends' });

    const refused = await post(alice, `/api/conversations/${chat._id}/messages`, { content: 'again' });
    assert.equal(refused.status, 403);
    assert.match(refused.body.message, /friends/);

    // The history is still there to read.
    const history = await get(alice, `/api/conversations/${chat._id}/messages`);
    assert.equal(history.body.messages.length, 1);

    // Bob can still write, and then Alice may answer.
    assert.equal((await post(bob, `/api/conversations/${chat._id}/messages`, { content: 'hi alice' })).status, 201);
    assert.equal((await post(alice, `/api/conversations/${chat._id}/messages`, { content: 'hi bob' })).status, 201);
  });

  it('friends only: becoming friends lifts the limit', async () => {
    const chat = await startDirect(alice, bob);
    await patch(bob, '/api/friends/settings', { whoCanMessage: 'friends' });

    assert.equal((await post(alice, `/api/conversations/${chat._id}/messages`, { content: 'hi' })).status, 403);

    await befriend(alice, bob);
    assert.equal((await post(alice, `/api/conversations/${chat._id}/messages`, { content: 'hi' })).status, 201);

    await del(bob, `/api/friends/${alice.id}`);
    assert.equal((await post(alice, `/api/conversations/${chat._id}/messages`, { content: 'hi' })).status, 403);
  });

  it('friends only does not affect groups', async () => {
    await patch(bob, '/api/friends/settings', { whoCanMessage: 'friends' });

    const group = await post(alice, '/api/conversations', { type: 'group', name: 'Team', memberIds: [bob.id] });
    assert.equal(group.status, 201);

    const sent = await post(alice, `/api/conversations/${group.body.conversation._id}/messages`, { content: 'hi all' });
    assert.equal(sent.status, 201);
  });

  it('removes friendships and requests when an account is deleted', async () => {
    await befriend(alice, bob);
    await post(carol, `/api/friends/requests/${bob.id}`);

    const gone = await del(bob, '/api/profile').send({ password: bob.password });
    assert.equal(gone.status, 200);

    assert.equal(await Friendship.countDocuments({}), 0);
    assert.equal((await get(alice, '/api/friends')).body.friends.length, 0);
    assert.equal((await get(carol, '/api/friends')).body.outgoing.length, 0);
  });
});
