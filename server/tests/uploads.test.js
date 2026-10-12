import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import app from '../app.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

// These tests only cover the cases where the server says NO before anything reaches Cloudinary.
describe('file uploads', () => {
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

  const url = () => `/api/conversations/${chat._id}/attachments`;

  const attach = (user, buffer, filename, contentType) =>
    request(app).post(url()).set(authHeader(user)).attach('files', buffer, { filename, contentType });

  it('needs a login', async () => {
    const res = await request(app).post(url()).attach('files', Buffer.from('x'), 'a.png');
    assert.equal(res.status, 401);
  });

  it('turns outsiders away before reading anything', async () => {
    const res = await attach(carol, Buffer.from('x'), 'a.png', 'image/png');
    assert.equal(res.status, 404);
  });

  it('needs at least one file', async () => {
    const res = await request(app).post(url()).set(authHeader(alice)).send({});
    assert.equal(res.status, 400);
  });

  it('refuses a file type that is not allowed', async () => {
    const res = await attach(alice, Buffer.from('hello'), 'virus.exe', 'application/x-msdownload');
    assert.equal(res.status, 415);
  });

  it('refuses text pretending to be an image', async () => {
    const res = await attach(alice, Buffer.from('this is not an image'), 'fake.png', 'image/png');

    assert.equal(res.status, 415);
    assert.match(res.body.message, /not a real/);
  });

  it('refuses a file that is too big', async () => {
    const res = await attach(alice, Buffer.alloc(11 * 1024 * 1024), 'big.png', 'image/png');
    assert.equal(res.status, 413);
  });

  it('refuses more than 5 files at once', async () => {
    let req = request(app).post(url()).set(authHeader(alice));

    for (let index = 0; index < 6; index += 1) {
      req = req.attach('files', Buffer.from('x'), { filename: `f${index}.png`, contentType: 'image/png' });
    }

    const res = await req;
    assert.equal(res.status, 400);
  });

  it('refuses a profile photo that is not a real image', async () => {
    const wrongType = await request(app)
      .post('/api/profile/avatar')
      .set(authHeader(alice))
      .attach('avatar', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(wrongType.status, 415);

    const fake = await request(app)
      .post('/api/profile/avatar')
      .set(authHeader(alice))
      .attach('avatar', Buffer.from('not a picture'), { filename: 'me.png', contentType: 'image/png' });
    assert.equal(fake.status, 415);

    const none = await request(app).post('/api/profile/avatar').set(authHeader(alice));
    assert.equal(none.status, 400);
  });
});
