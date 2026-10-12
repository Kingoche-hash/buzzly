import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Post from '../models/Post.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb } from './helpers.js';

// Photos are never really uploaded in tests: posts are created directly in the database.
const makePost = (author, caption = 'Hello') =>
  Post.create({
    author: author.id,
    caption,
    image: {
      url: 'https://res.cloudinary.com/test/image/upload/v1/sample.jpg',
      publicId: '',
      width: 800,
      height: 1000,
    },
  });

describe('posts, likes and comments', () => {
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
  });

  const get = (user, url) => request(app).get(url).set(authHeader(user));
  const post = (user, url, body) => request(app).post(url).set(authHeader(user)).send(body);
  const del = (user, url) => request(app).delete(url).set(authHeader(user));
  const captions = (res) => res.body.posts.map((item) => item.caption);

  it('needs a login', async () => {
    assert.equal((await request(app).get('/api/posts')).status, 401);
    assert.equal((await request(app).post('/api/posts')).status, 401);
  });

  it('refuses a post without a photo', async () => {
    const res = await request(app).post('/api/posts').set(authHeader(alice)).field('caption', 'No photo');
    assert.equal(res.status, 400);
  });

  it('refuses files that are not real photos', async () => {
    const fake = await request(app)
      .post('/api/posts')
      .set(authHeader(alice))
      .attach('image', Buffer.from('this is not an image'), { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(fake.status, 415);

    const wrongType = await request(app)
      .post('/api/posts')
      .set(authHeader(alice))
      .attach('image', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(wrongType.status, 415);
  });

  it('refuses a photo that is too big', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(authHeader(alice))
      .attach('image', Buffer.alloc(11 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });
    assert.equal(res.status, 413);
  });

  it('lists the feed newest first, with my likes and my own posts marked', async () => {
    const first = await makePost(alice, 'first');
    await makePost(bob, 'second');
    await makePost(alice, 'third');

    await post(bob, `/api/posts/${first._id}/like`);

    const res = await get(bob, '/api/posts');
    assert.equal(res.status, 200);
    assert.deepEqual(captions(res), ['third', 'second', 'first']);
    assert.deepEqual(res.body.posts.map((item) => item.mine), [false, true, false]);
    assert.deepEqual(res.body.posts.map((item) => item.liked), [false, false, true]);
    assert.equal(res.body.posts[0].author.username, 'alice');
    assert.ok(res.body.posts[0].imageUrl.includes('sample.jpg'));

    const aliceView = await get(alice, '/api/posts');
    assert.equal(aliceView.body.posts[2].liked, false);
    assert.equal(aliceView.body.posts[2].likeCount, 1);
  });

  it('pages through the feed without loading everything', async () => {
    for (const caption of ['p1', 'p2', 'p3', 'p4', 'p5']) await makePost(alice, caption);

    const page1 = await get(bob, '/api/posts?limit=2');
    assert.deepEqual(captions(page1), ['p5', 'p4']);
    assert.equal(page1.body.hasMore, true);

    const page2 = await get(bob, `/api/posts?limit=2&before=${page1.body.nextCursor}`);
    assert.deepEqual(captions(page2), ['p3', 'p2']);
    assert.equal(page2.body.hasMore, true);

    const page3 = await get(bob, `/api/posts?limit=2&before=${page2.body.nextCursor}`);
    assert.deepEqual(captions(page3), ['p1']);
    assert.equal(page3.body.hasMore, false);
  });

  it("shows only one person's posts on their page", async () => {
    await makePost(alice, 'mine');
    await makePost(bob, 'his');

    const res = await get(carol, `/api/posts/user/${alice.id}`);
    assert.deepEqual(captions(res), ['mine']);
  });

  it('likes and unlikes without ever counting twice', async () => {
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/like`;

    assert.equal((await post(bob, url)).body.likeCount, 1);
    const again = await post(bob, url);
    assert.equal(again.body.likeCount, 1);
    assert.equal(again.body.liked, true);

    assert.equal((await del(bob, url)).body.likeCount, 0);
    const twice = await del(bob, url);
    assert.equal(twice.body.likeCount, 0);
    assert.equal(twice.body.liked, false);
  });

  it('counts likes from different people', async () => {
    const item = await makePost(alice);

    await post(bob, `/api/posts/${item._id}/like`);
    await post(carol, `/api/posts/${item._id}/like`);

    const res = await get(alice, `/api/posts/${item._id}`);
    assert.equal(res.body.post.likeCount, 2);
    assert.equal(res.body.post.liked, false);
  });

  it('adds comments, lists them newest first and counts them', async () => {
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/comments`;

    const first = await post(bob, url, { text: 'first' });
    assert.equal(first.status, 201);
    assert.equal(first.body.comment.author.username, 'bob');
    await post(carol, url, { text: 'second' });

    const list = await get(alice, url);
    assert.deepEqual(list.body.comments.map((comment) => comment.text), ['second', 'first']);
    assert.deepEqual(list.body.comments.map((comment) => comment.canDelete), [true, true]); // alice owns the post

    const asBob = await get(bob, url);
    assert.deepEqual(asBob.body.comments.map((comment) => comment.canDelete), [false, true]);

    const single = await get(alice, `/api/posts/${item._id}`);
    assert.equal(single.body.post.commentCount, 2);
  });

  it('refuses empty and too long comments', async () => {
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/comments`;

    assert.equal((await post(bob, url, { text: '   ' })).status, 400);
    assert.equal((await post(bob, url, { text: 'x'.repeat(501) })).status, 400);
  });

  it('lets a comment be deleted by its writer or by the post owner, but not by a stranger', async () => {
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/comments`;

    const written = await post(bob, url, { text: 'hello' });
    const commentUrl = `${url}/${written.body.comment._id}`;

    assert.equal((await del(carol, commentUrl)).status, 403);
    assert.equal((await del(bob, commentUrl)).status, 200);
    assert.equal((await get(alice, `/api/posts/${item._id}`)).body.post.commentCount, 0);

    const again = await post(bob, url, { text: 'again' });
    assert.equal((await del(alice, `${url}/${again.body.comment._id}`)).status, 200);
  });

  it('lets only the author delete a post, and cleans up after it', async () => {
    const item = await makePost(alice);
    await post(bob, `/api/posts/${item._id}/like`);
    await post(bob, `/api/posts/${item._id}/comments`, { text: 'nice' });

    assert.equal((await del(bob, `/api/posts/${item._id}`)).status, 404);
    assert.equal((await del(alice, `/api/posts/${item._id}`)).status, 200);

    assert.equal(await Comment.countDocuments({ post: item._id }), 0);
    assert.equal(await Like.countDocuments({ post: item._id }), 0);
    assert.equal((await get(bob, `/api/posts/${item._id}`)).status, 404);
  });

  it('hides a post after three different people report it', async () => {
    const dave = await makeUser('dave');
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/report`;

    assert.equal((await post(alice, url, { reason: 'spam' })).status, 400); // not your own post
    assert.equal((await post(bob, url, { reason: 'nonsense' })).status, 400);

    assert.equal((await post(bob, url, { reason: 'spam' })).status, 200);
    assert.equal((await post(bob, url, { reason: 'spam' })).status, 200); // twice still counts once

    // The reporter no longer sees it, everybody else still does.
    assert.equal((await get(bob, '/api/posts')).body.posts.length, 0);
    assert.equal((await get(carol, '/api/posts')).body.posts.length, 1);

    await post(carol, url, { reason: 'harassment' });
    assert.equal((await get(dave, '/api/posts')).body.posts.length, 1); // two reports: still visible

    await post(dave, url, { reason: 'other' });
    assert.equal((await get(alice, '/api/posts')).body.posts.length, 0); // three reports: hidden
    assert.equal((await get(alice, `/api/posts/${item._id}`)).status, 404);
  });

  it('removes everything an account owns when it is deleted', async () => {
    const aliceThing = await makePost(alice, 'alice post');
    await makePost(bob, 'bob post');

    await post(bob, `/api/posts/${aliceThing._id}/like`);
    await post(bob, `/api/posts/${aliceThing._id}/comments`, { text: 'from bob' });

    const gone = await request(app)
      .delete('/api/profile')
      .set(authHeader(bob))
      .send({ password: bob.password });
    assert.equal(gone.status, 200);

    const feed = await get(alice, '/api/posts');
    assert.deepEqual(captions(feed), ['alice post']);
    assert.equal(feed.body.posts[0].likeCount, 0);
    assert.equal(feed.body.posts[0].commentCount, 0);
    assert.equal(await Post.countDocuments({ author: bob.id }), 0);
  });

  it('fetches one post, and answers 404 or 400 for bad ones', async () => {
    const item = await makePost(alice, 'hello');

    const found = await get(bob, `/api/posts/${item._id}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.post.caption, 'hello');

    const ghost = new mongoose.Types.ObjectId().toString();
    assert.equal((await get(bob, `/api/posts/${ghost}`)).status, 404);
    assert.equal((await get(bob, '/api/posts/123')).status, 400);
  });
});
