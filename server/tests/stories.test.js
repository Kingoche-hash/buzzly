import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import Story from '../models/Story.js';
import { cleanupExpiredStories } from '../services/story.service.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

describe('stories', () => {
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
    await startDirect(alice, bob); // alice and bob share a chat, carol is a stranger
  });

  const post = (user, body) => request(app).post('/api/stories').set(authHeader(user)).send(body);
  const feed = (user) => request(app).get('/api/stories').set(authHeader(user));
  const groupOf = (res, author) => res.body.groups.find((group) => group.author._id === author.id);

  const postStory = async () => {
    const res = await post(alice, { text: 'Hello world', background: 'ocean' });
    assert.equal(res.status, 201);
    return res.body.story;
  };

  it('posts a text story', async () => {
    const res = await post(alice, { text: 'Hello world', background: 'ocean' });

    assert.equal(res.status, 201);
    assert.equal(res.body.story.type, 'text');
    assert.equal(res.body.story.text, 'Hello world');
  });

  it('refuses empty stories, unknown backgrounds and fake photos', async () => {
    assert.equal((await post(alice, {})).status, 400);
    assert.equal((await post(alice, { text: 'Hi', background: 'neon' })).status, 400);

    const fake = await request(app)
      .post('/api/stories')
      .set(authHeader(alice))
      .attach('image', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(fake.status, 415);
  });

  it('shows a story to the author and to people who chat with them, but not to strangers', async () => {
    await postStory();

    const own = await feed(alice);
    assert.equal(groupOf(own, alice).stories[0].viewerCount, 0);

    const contact = await feed(bob);
    assert.equal(groupOf(contact, alice).stories.length, 1);
    assert.equal(groupOf(contact, alice).stories[0].viewed, false);

    const stranger = await feed(carol);
    assert.equal(groupOf(stranger, alice), undefined);
  });

  it('records who viewed a story, and only the author can see the list', async () => {
    const story = await postStory();

    const view = await request(app).post(`/api/stories/${story._id}/view`).set(authHeader(bob));
    assert.equal(view.status, 200);

    assert.equal(groupOf(await feed(bob), alice).stories[0].viewed, true);
    assert.equal(groupOf(await feed(alice), alice).stories[0].viewerCount, 1);

    const viewers = await request(app).get(`/api/stories/${story._id}/viewers`).set(authHeader(alice));
    assert.equal(viewers.status, 200);
    assert.equal(viewers.body.viewers[0]._id, bob.id);

    const nosy = await request(app).get(`/api/stories/${story._id}/viewers`).set(authHeader(bob));
    assert.equal(nosy.status, 404);
  });

  it('does not let a stranger view a story', async () => {
    const story = await postStory();
    const res = await request(app).post(`/api/stories/${story._id}/view`).set(authHeader(carol));

    assert.equal(res.status, 404);
  });

  it('lets only the author delete a story', async () => {
    const story = await postStory();

    const byBob = await request(app).delete(`/api/stories/${story._id}`).set(authHeader(bob));
    assert.equal(byBob.status, 404);

    const byAlice = await request(app).delete(`/api/stories/${story._id}`).set(authHeader(alice));
    assert.equal(byAlice.status, 200);

    assert.equal(groupOf(await feed(bob), alice), undefined);
  });

  it('hides and cleans up stories after 24 hours', async () => {
    const story = await postStory();

    await Story.updateOne({ _id: story._id }, { expiresAt: new Date(Date.now() - 1000) });

    assert.equal(groupOf(await feed(bob), alice), undefined);

    await cleanupExpiredStories();
    assert.equal(await Story.countDocuments(), 0);
  });

  it('needs a login', async () => {
    assert.equal((await request(app).get('/api/stories')).status, 401);
  });
});
