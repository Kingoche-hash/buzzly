import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import Story from '../models/Story.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

describe('story replies', () => {
  let alice;
  let bob;
  let carol;
  let chat;
  let story;

  before(openTestDb);
  after(closeTestDb);

  beforeEach(async () => {
    await clearDatabase();
    alice = await makeUser('alice');
    bob = await makeUser('bob');
    carol = await makeUser('carol');
    chat = await startDirect(alice, bob);

    const posted = await request(app)
      .post('/api/stories')
      .set(authHeader(alice))
      .send({ text: 'Hello world', background: 'ocean' });

    assert.equal(posted.status, 201);
    story = posted.body.story;
  });

  const reply = (user, body, id = story._id) =>
    request(app).post(`/api/stories/${id}/reply`).set(authHeader(user)).send(body);

  it('needs a login', async () => {
    const res = await request(app).post(`/api/stories/${story._id}/reply`).send({ content: 'hi' });
    assert.equal(res.status, 401);
  });

  it('lets a contact reply, and remembers what the story said', async () => {
    const res = await reply(bob, { content: 'Love this!' });

    assert.equal(res.status, 201);
    assert.equal(res.body.message.content, 'Love this!');
    assert.equal(res.body.message.sender.username, 'bob');
    assert.equal(res.body.message.conversation, chat._id);
    assert.equal(res.body.message.storyReply.type, 'text');
    assert.equal(res.body.message.storyReply.text, 'Hello world');
    assert.equal(res.body.message.storyReply.background, 'ocean');
  });

  it('shows the reply in the chat history, even after the story is deleted', async () => {
    await reply(bob, { content: 'Love this!' });

    const deleted = await request(app).delete(`/api/stories/${story._id}`).set(authHeader(alice));
    assert.equal(deleted.status, 200);

    const history = await request(app)
      .get(`/api/conversations/${chat._id}/messages`)
      .set(authHeader(alice));

    assert.equal(history.body.messages.length, 1);
    assert.equal(history.body.messages[0].content, 'Love this!');
    assert.equal(history.body.messages[0].storyReply.text, 'Hello world');
  });

  it('refuses a stranger', async () => {
    const res = await reply(carol, { content: 'Hi' });
    assert.equal(res.status, 404);
  });

  it('refuses a reply to your own story', async () => {
    const res = await reply(alice, { content: 'Hi me' });
    assert.equal(res.status, 400);
  });

  it('refuses empty and too long replies', async () => {
    assert.equal((await reply(bob, { content: '   ' })).status, 400);
    assert.equal((await reply(bob, { content: 'x'.repeat(501) })).status, 400);
  });

  it('refuses a story that has expired', async () => {
    await Story.updateOne({ _id: story._id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await reply(bob, { content: 'Too late' });
    assert.equal(res.status, 404);
  });

  it('creates the direct chat when two people only share a group', async () => {
    const group = await request(app)
      .post('/api/conversations')
      .set(authHeader(alice))
      .send({ type: 'group', name: 'Team', memberIds: [carol.id] });
    assert.equal(group.status, 201);

    const before = await request(app).get('/api/conversations').set(authHeader(carol));
    assert.equal(before.body.conversations.filter((c) => c.type === 'direct').length, 0);

    const res = await reply(carol, { content: 'Nice one' });
    assert.equal(res.status, 201);

    const after = await request(app).get('/api/conversations').set(authHeader(carol));
    assert.equal(after.body.conversations.filter((c) => c.type === 'direct').length, 1);
  });
});
