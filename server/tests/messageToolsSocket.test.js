import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import app from '../app.js';
import { initSocket } from '../socket/index.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sleep, startDirect } from './helpers.js';

describe('message tools over the live connection', () => {
  let server;
  let ioServer;
  let port;
  let alice;
  let bob;
  let carol;
  let chat;
  const clients = [];

  before(async () => {
    await openTestDb();
    server = http.createServer(app);
    ioServer = initSocket(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    clients.forEach((client) => client.close());
    await sleep(150);
    await new Promise((resolve) => ioServer.close(resolve));
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    alice = await makeUser('alice');
    bob = await makeUser('bob');
    carol = await makeUser('carol');
    chat = await startDirect(alice, bob); // made BEFORE connecting, so the rooms exist
  });

  afterEach(async () => {
    clients.forEach((client) => client.close());
    clients.length = 0;
    await sleep(150);
  });

  const connectClient = (token) =>
    new Promise((resolve, reject) => {
      const client = connect(`http://127.0.0.1:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', (error) => {
        client.close();
        reject(error);
      });
    });

  const emitWithAck = (client, event, payload) =>
    new Promise((resolve) => {
      client.timeout(3000).emit(event, payload, (error, response) => {
        resolve(error ? { ok: false, error: 'no answer' } : response);
      });
    });

  const waitFor = (client, event) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No "${event}" event arrived`)), 3000);

      client.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

  const listen = (client, event) => {
    const seen = { count: 0 };
    client.on(event, () => {
      seen.count += 1;
    });
    return seen;
  };

  const url = (id, suffix = '') => `/api/conversations/${chat._id}/messages/${id}${suffix}`;

  it('sends a reply over the live connection', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const first = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'question' });
    const heard = waitFor(a, 'receive_message');

    const answer = await emitWithAck(b, 'send_message', {
      conversationId: chat._id,
      content: 'answer',
      replyTo: first.message._id,
    });

    assert.equal(answer.ok, true);
    assert.equal(answer.message.replyTo.text, 'question');
    assert.equal((await heard).replyTo.message, first.message._id);
  });

  it('refuses a live reply to a message from somewhere else', async () => {
    const a = await connectClient(alice.token);

    const answer = await emitWithAck(a, 'send_message', {
      conversationId: chat._id,
      content: 'answer',
      replyTo: '0123456789abcdef01234567',
    });

    assert.equal(answer.ok, false);
  });

  it('tells everyone in the chat about an edit, but nobody outside it', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);
    const c = await connectClient(carol.token);

    const sent = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'first' });

    const heardByBob = waitFor(b, 'message_updated');
    const heardByCarol = listen(c, 'message_updated');

    await request(app).patch(url(sent.message._id)).set(authHeader(alice)).send({ content: 'second' });

    const update = await heardByBob;
    assert.equal(update.content, 'second');
    assert.ok(update.editedAt);

    await sleep(300);
    assert.equal(heardByCarol.count, 0);
  });

  it('tells everyone when a message is deleted for everyone or reacted to', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const sent = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'hello' });

    const reacted = waitFor(a, 'message_updated');
    await request(app).put(url(sent.message._id, '/reaction')).set(authHeader(bob)).send({ emoji: '👍' });
    assert.equal((await reacted).reactions.length, 1);

    const deleted = waitFor(b, 'message_updated');
    await request(app).delete(url(sent.message._id, '?scope=everyone')).set(authHeader(alice));
    assert.ok((await deleted).deletedAt);
  });

  it('tells only my own windows when I delete a message for myself', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const sent = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'hello' });

    const heardByAlice = waitFor(a, 'message_removed');
    const heardByBob = listen(b, 'message_removed');

    await request(app).delete(url(sent.message._id, '?scope=me')).set(authHeader(alice));

    const removed = await heardByAlice;
    assert.equal(removed.messageId, sent.message._id);

    await sleep(300);
    assert.equal(heardByBob.count, 0);
  });
});
