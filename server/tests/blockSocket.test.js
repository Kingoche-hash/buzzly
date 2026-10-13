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

describe('blocking over the live connection', () => {
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

  const block = (blocker, target) =>
    request(app).post(`/api/blocks/${target.id}`).set(authHeader(blocker)).send({});

  it('does not announce a person to someone they have a block with', async () => {
    await startDirect(alice, carol);

    const b = await connectClient(bob.token);
    const c = await connectClient(carol.token);
    await sleep(600); // let their own "I am online" announcements pass first

    const heardByBob = listen(b, 'user_online');
    const heardByCarol = listen(c, 'user_online');

    await block(alice, bob);
    await sleep(300);

    const a = await connectClient(alice.token);
    await sleep(600);

    assert.equal(heardByBob.count, 0);
    assert.ok(heardByCarol.count >= 1);

    const bobsList = await emitWithAck(b, 'get_presence', {});
    assert.equal(bobsList.onlineUserIds.includes(alice.id), false);

    const alicesList = await emitWithAck(a, 'get_presence', {});
    assert.equal(alicesList.onlineUserIds.includes(bob.id), false);
    assert.equal(alicesList.onlineUserIds.includes(carol.id), true);
  });

  it('refuses messages sent over the live connection in a blocked chat', async () => {
    const a = await connectClient(alice.token);
    await connectClient(bob.token);

    await block(alice, bob);

    const ack = await emitWithAck(a, 'send_message', { conversationId: chat._id, content: 'hi' });
    assert.equal(ack.ok, false);
  });

  it('tells both people to refresh when a block changes', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const toAlice = waitFor(a, 'blocks_changed');
    const toBob = waitFor(b, 'blocks_changed');

    await block(alice, bob);

    await Promise.all([toAlice, toBob]);
  });
});
