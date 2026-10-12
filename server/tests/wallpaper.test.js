import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

// Only the cases where the server says NO before anything reaches Cloudinary.
describe('photo wallpapers', () => {
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

  const url = () => `/api/conversations/${chat._id}/wallpaper`;

  const attach = (user, buffer, filename, contentType) =>
    request(app).post(url()).set(authHeader(user)).attach('image', buffer, { filename, contentType });

  it('needs a login', async () => {
    const res = await request(app).post(url()).attach('image', Buffer.from('x'), 'a.png');
    assert.equal(res.status, 401);
  });

  it('turns outsiders away', async () => {
    const res = await attach(carol, Buffer.from('x'), 'a.png', 'image/png');
    assert.equal(res.status, 404);
  });

  it('needs a photo', async () => {
    const res = await request(app).post(url()).set(authHeader(alice));
    assert.equal(res.status, 400);
  });

  it('refuses a file that is not a JPG, PNG or WEBP', async () => {
    const res = await attach(alice, Buffer.from('hello'), 'notes.txt', 'text/plain');
    assert.equal(res.status, 415);
  });

  it('refuses text pretending to be an image', async () => {
    const res = await attach(alice, Buffer.from('this is not an image'), 'fake.png', 'image/png');
    assert.equal(res.status, 415);
  });

  it('refuses a photo that is too big', async () => {
    const res = await attach(alice, Buffer.alloc(11 * 1024 * 1024), 'big.png', 'image/png');
    assert.equal(res.status, 413);
  });

  it('starts every chat with no photo wallpaper', async () => {
    const res = await request(app).get('/api/conversations').set(authHeader(alice));

    assert.equal(res.body.conversations[0].state.wallpaper, 'default');
    assert.equal(res.body.conversations[0].state.wallpaperUrl, '');
  });

  it('still lets a built-in wallpaper be chosen', async () => {
    const res = await request(app)
      .patch(`/api/conversations/${chat._id}/state`)
      .set(authHeader(alice))
      .send({ wallpaper: 'ocean' });

    assert.equal(res.status, 200);
    assert.equal(res.body.state.wallpaper, 'ocean');
    assert.equal(res.body.state.wallpaperUrl, '');
  });
});
