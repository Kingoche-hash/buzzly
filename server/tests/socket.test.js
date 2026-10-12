import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import app from '../app.js';
import { initSocket } from '../socket/index.js';
import {
  authHeader,
  clearDatabase,
  closeTestDb,
  makeUser,
  openTestDb,
  sleep,
  startDirect,
} from './helpers.js';

describe('live connection (Socket.io)', () => {
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

  // Opens a live connection. Resolves when connected, rejects with the server's reason if refused.
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

  // Sends an event and waits for the server's answer.
  const emitWithAck = (client, event, payload) =>
    new Promise((resolve) => {
      client.timeout(3000).emit(event, payload, (error, response) => {
        resolve(error ? { ok: false, error: 'no answer' } : response);
      });
    });

  // Waits for the next time an event arrives.
  const waitFor = (client, event) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No "${event}" event arrived`)), 3000);

      client.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

  // Remembers if an event ever arrives (to prove that something did NOT happen).
  const listen = (client, event) => {
    const seen = { count: 0 };
    client.on(event, () => {
      seen.count += 1;
    });
    return seen;
  };

  it('refuses a connection without a token or with a fake one', async () => {
    await assert.rejects(connectClient(undefined), /Not authenticated/);
    await assert.rejects(connectClient('fake-token'), /Invalid or expired token/);
  });

  it('accepts a connection with a real token', async () => {
    const client = await connectClient(alice.token);
    assert.equal(client.connected, true);
  });

  it('delivers a message live to the other person and answers the sender', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const heard = waitFor(b, 'receive_message');
    const ack = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'Hello live' });

    assert.equal(ack.ok, true);
    assert.equal(ack.message.content, 'Hello live');

    const message = await heard;
    assert.equal(message.content, 'Hello live');
    assert.equal(message.sender.username, 'alice');
  });

  it('refuses empty messages', async () => {
    const a = await connectClient(alice.token);
    const ack = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: '   ' });

    assert.equal(ack.ok, false);
  });

  it('does not let an outsider send, join, or listen', async () => {
    const a = await connectClient(alice.token);
    const c = await connectClient(carol.token);

    const heardByCarol = listen(c, 'receive_message');

    const send = await emitWithAck(c, 'send_message', { conversationId: chat._id, content: 'sneaky' });
    assert.equal(send.ok, false);
    assert.equal(send.error, 'Conversation not found');

    const join = await emitWithAck(c, 'join_conversation', { conversationId: chat._id });
    assert.equal(join.ok, false);

    await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'private' });
    await sleep(400);

    assert.equal(heardByCarol.count, 0);
  });

  it('relays typing to the other member only', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);
    const c = await connectClient(carol.token);

    const heardByCarol = listen(c, 'typing_start');
    const heardByBob = waitFor(b, 'typing_start');

    a.emit('typing_start', { conversationId: chat._id });

    const typing = await heardByBob;
    assert.equal(typing.userId, alice.id);
    assert.equal(typing.username, 'alice');

    await sleep(300);
    assert.equal(heardByCarol.count, 0);
  });

  it('sends no typing signal for someone who turned typing indicators off', async () => {
    await request(app)
      .patch('/api/profile')
      .set(authHeader(bob))
      .send({ privacy: { typingIndicators: false } });

    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const heardByAlice = listen(a, 'typing_start');

    b.emit('typing_start', { conversationId: chat._id });
    await sleep(400);

    assert.equal(heardByAlice.count, 0);
  });

  it('tells the sender when the other person reads, and refuses outsiders', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);
    const c = await connectClient(carol.token);

    const sent = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'read me' });

    const readEvent = waitFor(a, 'messages_read');
    const ack = await emitWithAck(b, 'message_read', {
      conversationId: chat._id,
      messageId: sent.message._id,
    });
    assert.equal(ack.ok, true);

    const read = await readEvent;
    assert.equal(read.userId, bob.id);

    const history = await request(app)
      .get(`/api/conversations/${chat._id}/messages`)
      .set(authHeader(alice));
    assert.ok(history.body.messages[0].readBy.includes(bob.id));

    const outsider = await emitWithAck(c, 'message_read', {
      conversationId: chat._id,
      messageId: sent.message._id,
    });
    assert.equal(outsider.ok, false);
  });

  it('tells contacts when someone comes online, and lists who is online', async () => {
    const a = await connectClient(alice.token);
    await sleep(500); // let Alice's own "I am online" announcement pass first

    const cameOnline = waitFor(a, 'user_online');
    await connectClient(bob.token);

    const event = await cameOnline;
    assert.equal(event.userId, bob.id);

    const presence = await emitWithAck(a, 'get_presence', {});
    assert.equal(presence.ok, true);
    assert.ok(presence.onlineUserIds.includes(bob.id));
  });

  it('keeps someone invisible who hides their online status', async () => {
    await request(app)
      .patch('/api/profile')
      .set(authHeader(bob))
      .send({ privacy: { showPresence: false } });

    const a = await connectClient(alice.token);
    await sleep(500); // let Alice's own "I am online" announcement pass first
    const heardOnline = listen(a, 'user_online');

    await connectClient(bob.token);
    await sleep(500);

    assert.equal(heardOnline.count, 0);

    const presence = await emitWithAck(a, 'get_presence', {});
    assert.equal(presence.onlineUserIds.includes(bob.id), false);
  });

  it('hangs up the connections of a deleted account', async () => {
    const b = await connectClient(bob.token);
    const gone = new Promise((resolve) => b.once('disconnect', resolve));

    await request(app)
      .delete('/api/profile')
      .set(authHeader(bob))
      .send({ password: bob.password });

    await Promise.race([gone, sleep(3000).then(() => assert.fail('the connection stayed open'))]);
    assert.equal(b.connected, false);
  });
});
