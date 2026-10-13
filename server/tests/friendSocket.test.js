import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import app from '../app.js';
import { initSocket } from '../socket/index.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sleep } from './helpers.js';

describe('friend requests over the live connection', () => {
  let server;
  let ioServer;
  let port;
  let alice;
  let bob;
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

  // Collects every "friends_changed" event this window receives.
  const collect = (client) => {
    const events = [];
    client.on('friends_changed', (event) => events.push(event));
    return events;
  };

  it('tells both people about a request and about the answer', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const heardByAlice = collect(a);
    const heardByBob = collect(b);

    await request(app).post(`/api/friends/requests/${bob.id}`).set(authHeader(alice)).send({});
    await sleep(400);

    assert.ok(heardByBob.some((event) => event.kind === 'request' && event.by._id === alice.id));
    assert.ok(heardByAlice.some((event) => event.kind === 'request'));

    await request(app).post(`/api/friends/requests/${alice.id}/accept`).set(authHeader(bob)).send({});
    await sleep(400);

    assert.ok(heardByAlice.some((event) => event.kind === 'accepted' && event.by._id === bob.id));
  });
});
