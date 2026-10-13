import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

describe('group tools: admins, members, name, photo, leaving, mentions', () => {
  let alice;
  let bob;
  let carol;
  let dave;
  let group;

  before(openTestDb);
  after(closeTestDb);

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

    assert.equal(res.status, 201);
    group = res.body.conversation;
  });

  const url = (suffix = '') => `/api/conversations/${group._id}${suffix}`;
  const get = (user, path) => request(app).get(path).set(authHeader(user));
  const post = (user, path, body = {}) => request(app).post(path).set(authHeader(user)).send(body);
  const put = (user, path) => request(app).put(path).set(authHeader(user)).send({});
  const del = (user, path) => request(app).delete(path).set(authHeader(user));
  const patch = (user, path, body) => request(app).patch(path).set(authHeader(user)).send(body);
  const ghost = () => new mongoose.Types.ObjectId().toString();

  const mine = async (user) =>
    (await get(user, '/api/conversations')).body.conversations.find((conversation) => conversation._id === group._id);
  const usernames = async (user) => (await mine(user)).members.map((member) => member.username).sort();
  const history = async (user) => (await get(user, url('/messages'))).body.messages;
  const notes = async (user) =>
    (await history(user)).filter((message) => message.system).map((message) => message.system.text);

  const attach = (user, buffer, filename, contentType) =>
    request(app).post(url('/group/avatar')).set(authHeader(user)).attach('image', buffer, { filename, contentType });

  // ---------------- admins ----------------

  it('makes the creator the admin', async () => {
    assert.deepEqual(group.admins, [alice.id]);
    assert.equal(group.createdBy, alice.id);
    assert.equal(group.avatar, '');
  });

  it('treats the creator of an older group (no admin list) as its admin', async () => {
    const legacy = await Conversation.create({
      type: 'group',
      name: 'Old',
      members: [alice.id, bob.id],
      createdBy: alice.id,
    });
    const legacyUrl = `/api/conversations/${legacy._id}`;

    assert.equal((await patch(bob, `${legacyUrl}/group`, { name: 'Hacked' })).status, 403);
    assert.equal((await patch(alice, `${legacyUrl}/group`, { name: 'Older' })).status, 200);

    // Promoting someone keeps the creator as an admin too.
    const promoted = await put(alice, `${legacyUrl}/admins/${bob.id}`);
    assert.equal(promoted.status, 200);
    assert.deepEqual([...promoted.body.conversation.admins].sort(), [alice.id, bob.id].sort());
  });

  it('only works on group chats and for members', async () => {
    const direct = await startDirect(alice, bob);

    assert.equal((await patch(alice, `/api/conversations/${direct._id}/group`, { name: 'x' })).status, 400);
    assert.equal((await post(alice, `/api/conversations/${direct._id}/leave`)).status, 400);
    assert.equal((await patch(dave, url('/group'), { name: 'x' })).status, 404);
    assert.equal((await post(dave, url('/leave'))).status, 404);
  });

  // ---------------- name and photo ----------------

  it('renames a group, leaves a note, and ignores an unchanged name', async () => {
    const res = await patch(alice, url('/group'), { name: 'Strategy' });
    assert.equal(res.status, 200);
    assert.equal(res.body.conversation.name, 'Strategy');

    assert.deepEqual(await notes(bob), ['alice renamed the group to "Strategy"']);
    assert.equal((await mine(carol)).name, 'Strategy');

    await patch(alice, url('/group'), { name: 'Strategy' });
    assert.equal((await notes(bob)).length, 1);
  });

  it('refuses bad names and non-admins', async () => {
    assert.equal((await patch(bob, url('/group'), { name: 'Mine now' })).status, 403);
    assert.equal((await patch(alice, url('/group'), { name: '   ' })).status, 400);
    assert.equal((await patch(alice, url('/group'), { name: 'x'.repeat(51) })).status, 400);
    assert.equal((await mine(alice)).name, 'Team');
  });

  it('refuses bad group photos before anything reaches Cloudinary', async () => {
    assert.equal((await request(app).post(url('/group/avatar'))).status, 401);
    assert.equal((await attach(dave, Buffer.from('x'), 'a.png', 'image/png')).status, 404);
    assert.equal((await attach(bob, Buffer.from('x'), 'a.png', 'image/png')).status, 403);

    assert.equal((await attach(alice, Buffer.from('hello'), 'notes.txt', 'text/plain')).status, 415);
    assert.equal((await attach(alice, Buffer.from('not an image'), 'fake.png', 'image/png')).status, 415);
    assert.equal((await attach(alice, Buffer.alloc(11 * 1024 * 1024), 'big.png', 'image/png')).status, 413);

    const none = await request(app).post(url('/group/avatar')).set(authHeader(alice));
    assert.equal(none.status, 400);
  });

  it('removing a photo that does not exist is harmless', async () => {
    const res = await del(alice, url('/group/avatar'));
    assert.equal(res.status, 200);
    assert.equal((await notes(bob)).length, 0);
    assert.equal((await del(bob, url('/group/avatar'))).status, 403);
  });

  // ---------------- adding members ----------------

  it('adds members, leaves a note, and shows the group (with its history) to the new member', async () => {
    await post(alice, url('/messages'), { content: 'before dave' });

    const res = await post(alice, url('/members'), { userIds: [dave.id] });
    assert.equal(res.status, 200);
    assert.equal(res.body.conversation.members.length, 4);

    assert.deepEqual(await usernames(bob), ['alice', 'bob', 'carol', 'dave']);
    assert.ok((await notes(dave)).includes('alice added dave'));

    const earlier = (await history(dave)).find((message) => message.content === 'before dave');
    assert.ok(earlier);
  });

  it('only adds the people who are new, and refuses when nobody is', async () => {
    const mixed = await post(alice, url('/members'), { userIds: [carol.id, dave.id] });
    assert.equal(mixed.status, 200);
    assert.deepEqual(await notes(bob), ['alice added dave']);

    assert.equal((await post(alice, url('/members'), { userIds: [carol.id, dave.id] })).status, 400);
  });

  it('refuses bad requests to add members', async () => {
    assert.equal((await post(bob, url('/members'), { userIds: [dave.id] })).status, 403);
    assert.equal((await post(alice, url('/members'), { userIds: [ghost()] })).status, 404);
    assert.equal((await post(alice, url('/members'), { userIds: [] })).status, 400);
    assert.equal((await post(alice, url('/members'), { userIds: ['123'] })).status, 400);
    assert.equal((await post(alice, url('/members'), {})).status, 400);
  });

  it('refuses to add someone who blocked me or whom I blocked', async () => {
    await post(dave, '/api/blocks/' + alice.id);
    assert.equal((await post(alice, url('/members'), { userIds: [dave.id] })).status, 404);

    await del(dave, '/api/blocks/' + alice.id);
    await post(alice, '/api/blocks/' + dave.id);
    assert.equal((await post(alice, url('/members'), { userIds: [dave.id] })).status, 404);
  });

  it('stops a group from growing past 50 members', async () => {
    const crowd = Array.from({ length: 49 }, () => new mongoose.Types.ObjectId());
    await Conversation.updateOne({ _id: group._id }, { members: [alice.id, ...crowd] });

    const res = await post(alice, url('/members'), { userIds: [dave.id] });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /50/);
  });

  it('refuses to put someone I blocked in a new group', async () => {
    await post(alice, '/api/blocks/' + dave.id);

    const res = await post(alice, '/api/conversations', { type: 'group', name: 'Nope', memberIds: [dave.id] });
    assert.equal(res.status, 404);
  });

  // ---------------- removing members ----------------

  it('removes a member, who loses the group at once', async () => {
    const res = await del(alice, url(`/members/${bob.id}`));
    assert.equal(res.status, 200);

    assert.equal(await mine(bob), undefined);
    assert.equal((await get(bob, url())).status, 404);
    assert.equal((await get(bob, url('/messages'))).status, 404);
    assert.deepEqual(await usernames(carol), ['alice', 'carol']);
    assert.deepEqual(await notes(carol), ['alice removed bob']);
  });

  it('refuses bad removals', async () => {
    assert.equal((await del(bob, url(`/members/${carol.id}`))).status, 403); // not an admin
    assert.equal((await del(alice, url(`/members/${alice.id}`))).status, 400); // leave instead
    assert.equal((await del(alice, url(`/members/${dave.id}`))).status, 404); // not a member

    await put(alice, url(`/admins/${carol.id}`));
    assert.equal((await del(alice, url(`/members/${carol.id}`))).status, 403); // an admin: demote first
  });

  // ---------------- admin rights ----------------

  it('promotes and demotes, and the new admin can manage the group', async () => {
    assert.equal((await put(bob, url(`/admins/${carol.id}`))).status, 403);

    const promoted = await put(alice, url(`/admins/${bob.id}`));
    assert.equal(promoted.status, 200);
    assert.ok(promoted.body.conversation.admins.includes(bob.id));
    assert.ok((await notes(carol)).includes('alice made bob an admin'));

    assert.equal((await patch(bob, url('/group'), { name: 'By bob' })).status, 200);

    // Promoting again changes nothing.
    await put(alice, url(`/admins/${bob.id}`));
    assert.equal((await notes(carol)).filter((text) => text.includes('made bob')).length, 1);

    const demoted = await del(alice, url(`/admins/${bob.id}`));
    assert.equal(demoted.status, 200);
    assert.equal((await patch(bob, url('/group'), { name: 'Again' })).status, 403);
  });

  it('protects the creator and refuses bad admin changes', async () => {
    await put(alice, url(`/admins/${bob.id}`));

    assert.equal((await del(bob, url(`/admins/${alice.id}`))).status, 403); // the creator
    assert.equal((await del(bob, url(`/admins/${bob.id}`))).status, 400); // yourself
    assert.equal((await put(alice, url(`/admins/${dave.id}`))).status, 404); // not a member
  });

  // ---------------- leaving ----------------

  it('lets a member leave, with a note', async () => {
    const res = await post(bob, url('/leave'));
    assert.equal(res.status, 200);

    assert.equal(await mine(bob), undefined);
    assert.deepEqual(await usernames(alice), ['alice', 'carol']);
    assert.deepEqual(await notes(alice), ['bob left']);
  });

  it('makes the longest-standing member the admin when the last admin leaves', async () => {
    await post(alice, url('/leave'));

    const seen = await mine(bob);
    assert.deepEqual(seen.admins, [bob.id]);
    assert.deepEqual(await notes(bob), ['alice left', 'bob is now an admin']);
    assert.equal((await patch(bob, url('/group'), { name: 'Bobs' })).status, 200);
  });

  it('deletes the group and its messages when the last person leaves', async () => {
    await post(alice, url('/messages'), { content: 'hello' });

    await post(bob, url('/leave'));
    await post(carol, url('/leave'));
    assert.equal(await Conversation.countDocuments({ _id: group._id }), 1);

    assert.equal((await post(alice, url('/leave'))).status, 200);
    assert.equal(await Conversation.countDocuments({ _id: group._id }), 0);
    assert.equal(await Message.countDocuments({ conversation: group._id }), 0);
  });

  // ---------------- notes and unread ----------------

  it('does not count notes as unread messages', async () => {
    await patch(alice, url('/group'), { name: 'Renamed' });
    await put(alice, url(`/admins/${carol.id}`));

    assert.equal((await mine(bob)).unreadCount, 0);

    await post(alice, url('/messages'), { content: 'a real message' });
    assert.equal((await mine(bob)).unreadCount, 1);
  });

  // ---------------- mentions ----------------

  it('remembers who a message mentions, only among the group members', async () => {
    const sent = async (content) => (await post(alice, url('/messages'), { content })).body.message;

    assert.deepEqual((await sent('hi @bob, look')).mentions, [bob.id]);
    assert.deepEqual((await sent('@BOB and @carol')).mentions.sort(), [bob.id, carol.id].sort());
    assert.deepEqual((await sent('@bob @bob @bob')).mentions, [bob.id]);

    assert.deepEqual((await sent('hello @dave')).mentions, []); // not in the group
    assert.deepEqual((await sent('mail me at x@bob.com')).mentions, []); // not a mention
    assert.deepEqual((await sent('nothing here')).mentions, []);
  });

  it('has no mentions in direct chats', async () => {
    const direct = await startDirect(alice, bob);

    const res = await post(alice, `/api/conversations/${direct._id}/messages`, { content: 'hi @bob' });
    assert.deepEqual(res.body.message.mentions, []);
  });
});
