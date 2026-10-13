import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import app from '../app.js';
import { initSocket } from '../socket/index.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, sleep } from './helpers.js';

describe('group changes over the live connection', () => {
  let server;
  let ioServer;
  let port;
  let alice;
  let bob;
  let carol;
  let dave;
  let group;
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
    dave = await makeUser('dave');

    const res = await request(app)
      .post('/api/conversations')
      .set(authHeader(alice))
      .send({ type: 'group', name: 'Team', memberIds: [bob.id, carol.id] });

    group = res.body.conversation; // made BEFORE connecting, so the rooms exist
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

  const url = (suffix = '') => `/api/conversations/${group._id}${suffix}`;

  it('tells every member about a rename, and shows the note live', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const update = waitFor(b, 'conversation_updated');
    const note = waitFor(b, 'receive_message');

    await request(app).patch(url('/group')).set(authHeader(alice)).send({ name: 'Strategy' });

    assert.equal((await update).name, 'Strategy');
    assert.match((await note).system.text, /renamed the group/);
    assert.ok(a.connected);
  });

  it('puts a new member in the room live', async () => {
    const a = await connectClient(alice.token);
    const d = await connectClient(dave.token);

    const shown = waitFor(d, 'conversation_created');
    await request(app).post(url('/members')).set(authHeader(alice)).send({ userIds: [dave.id] });

    const created = await shown;
    assert.equal(created._id, group._id);
    assert.equal(created.members.length, 4);

    // Without reconnecting, dave now hears the group.
    const heard = waitFor(d, 'receive_message');
    await emitWithAck(a, 'send_message', { conversationId: group._id, content: 'welcome dave' });
    assert.equal((await heard).content, 'welcome dave');
  });

  it('throws a removed member out of the room', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const gone = waitFor(b, 'conversation_removed');
    await request(app).delete(url(`/members/${bob.id}`)).set(authHeader(alice));
    assert.equal((await gone).conversationId, group._id);

    await sleep(200);
    const heardByBob = listen(b, 'receive_message');
    await emitWithAck(a, 'send_message', { conversationId: group._id, content: 'secret plans' });
    await sleep(400);

    assert.equal(heardByBob.count, 0);
  });

  it('tells the leaver, and the others, when someone leaves', async () => {
    const a = await connectClient(alice.token);
    const b = await connectClient(bob.token);

    const gone = waitFor(b, 'conversation_removed');
    const updated = waitFor(a, 'conversation_updated');

    await request(app).post(url('/leave')).set(authHeader(bob)).send({});

    await gone;
    assert.equal((await updated).members.length, 2);
  });
});
