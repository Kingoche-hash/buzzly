import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Post from '../models/Post.js';
import { authHeader, clearDatabase, closeTestDb, makeUser, openTestDb, startDirect } from './helpers.js';

// Photos are never really uploaded in tests: posts are created directly in the database.
const makePost = (author, caption = 'Hello') =>
  Post.create({
    author: author.id,
    caption,
    images: [
      {
        url: 'https://res.cloudinary.com/test/image/upload/v1/sample.jpg',
        publicId: '',
        width: 800,
        height: 1000,
      },
    ],
  });

describe('posts, reposts, shares, likes and comments', () => {
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
      .attach('images', Buffer.from('this is not an image'), { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(fake.status, 415);

    const wrongType = await request(app)
      .post('/api/posts')
      .set(authHeader(alice))
      .attach('images', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(wrongType.status, 415);
  });

  it('refuses a photo that is too big', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set(authHeader(alice))
      .attach('images', Buffer.alloc(11 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });
    assert.equal(res.status, 413);
  });

  it('refuses more than 10 photos at once', async () => {
    let req = request(app).post('/api/posts').set(authHeader(alice));

    for (let index = 0; index < 11; index += 1) {
      req = req.attach('images', Buffer.from('x'), { filename: `p${index}.png`, contentType: 'image/png' });
    }

    assert.equal((await req).status, 400);
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
    assert.equal(res.body.posts[0].images.length, 1);
    assert.ok(res.body.posts[0].imageUrl.includes('sample.jpg'));
    assert.equal(res.body.posts[0].repostedBy, null);

    const aliceView = await get(alice, '/api/posts');
    assert.equal(aliceView.body.posts[2].liked, false);
    assert.equal(aliceView.body.posts[2].likeCount, 1);
  });

  it('still shows older posts that kept a single picture', async () => {
    await Post.create({
      author: alice.id,
      caption: 'old style',
      image: { url: 'https://res.cloudinary.com/test/image/upload/v1/old.jpg', width: 600, height: 600 },
    });

    const res = await get(bob, '/api/posts');
    assert.equal(res.body.posts[0].images.length, 1);
    assert.ok(res.body.posts[0].imageUrl.includes('old.jpg'));
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

  it("shows only one person's posts on their page, with counts", async () => {
    await makePost(alice, 'mine');
    await makePost(bob, 'his');

    const res = await get(carol, `/api/posts/user/${alice.id}`);
    assert.deepEqual(captions(res), ['mine']);

    const summary = await get(carol, `/api/posts/user/${alice.id}/summary`);
    assert.deepEqual(summary.body, { posts: 1, reposts: 0 });
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

  it('reposts a post: it shows in the feed marked as a repost, and on the reposter profile', async () => {
    const original = await makePost(alice, 'original');

    const res = await post(bob, `/api/posts/${original._id}/repost`);
    assert.equal(res.status, 200);
    assert.equal(res.body.reposted, true);
    assert.equal(res.body.repostCount, 1);

    const feed = await get(carol, '/api/posts');
    assert.equal(feed.body.posts.length, 2);

    const [repost, plain] = feed.body.posts;
    assert.equal(repost.repostedBy.username, 'bob');
    assert.equal(repost.author.username, 'alice');
    assert.equal(repost.caption, 'original');
    assert.equal(repost._id, plain._id);
    assert.notEqual(repost.itemId, plain.itemId);
    assert.equal(plain.repostedBy, null);
    assert.equal(plain.repostCount, 1);
    assert.equal(plain.reposted, false);

    const asBob = await get(bob, '/api/posts');
    assert.ok(asBob.body.posts.every((item) => item.reposted === true));

    const reposts = await get(carol, `/api/posts/user/${bob.id}?type=reposts`);
    assert.deepEqual(captions(reposts), ['original']);

    const bobPosts = await get(carol, `/api/posts/user/${bob.id}?type=posts`);
    assert.equal(bobPosts.body.posts.length, 0);

    const summary = await get(carol, `/api/posts/user/${bob.id}/summary`);
    assert.deepEqual(summary.body, { posts: 0, reposts: 1 });
  });

  it('refuses reposting your own post, counts a repost once, and can undo it', async () => {
    const own = await makePost(alice);
    const url = `/api/posts/${own._id}/repost`;

    assert.equal((await post(alice, url)).status, 400);

    assert.equal((await post(bob, url)).body.repostCount, 1);
    assert.equal((await post(bob, url)).body.repostCount, 1);

    const undone = await del(bob, url);
    assert.equal(undone.body.repostCount, 0);
    assert.equal(undone.body.reposted, false);
    assert.equal((await del(bob, url)).body.repostCount, 0);

    assert.equal((await get(carol, '/api/posts')).body.posts.length, 1);
  });

  it('sends the likes and comments of a repost to the original post', async () => {
    const original = await makePost(alice, 'original');
    await post(bob, `/api/posts/${original._id}/repost`);

    await post(carol, `/api/posts/${original._id}/like`);
    await post(carol, `/api/posts/${original._id}/comments`, { text: 'nice' });

    const feed = await get(alice, '/api/posts');
    assert.ok(feed.body.posts.every((item) => item.likeCount === 1 && item.commentCount === 1));
  });

  it('removes the reposts when the original post is deleted', async () => {
    const original = await makePost(alice);
    await post(bob, `/api/posts/${original._id}/repost`);

    await del(alice, `/api/posts/${original._id}`);

    assert.equal((await get(carol, '/api/posts')).body.posts.length, 0);
    assert.deepEqual((await get(carol, `/api/posts/user/${bob.id}/summary`)).body, { posts: 0, reposts: 0 });
  });

  it('hides a post after three different people report it, reposts included', async () => {
    const dave = await makeUser('dave');
    const item = await makePost(alice);
    const url = `/api/posts/${item._id}/report`;

    await post(dave, `/api/posts/${item._id}/repost`);

    assert.equal((await post(alice, url, { reason: 'spam' })).status, 400); // not your own post
    assert.equal((await post(bob, url, { reason: 'nonsense' })).status, 400);

    assert.equal((await post(bob, url, { reason: 'spam' })).status, 200);
    assert.equal((await post(bob, url, { reason: 'spam' })).status, 200); // twice still counts once

    // The reporter no longer sees it, everybody else still does.
    assert.equal((await get(bob, '/api/posts')).body.posts.length, 0);
    assert.equal((await get(carol, '/api/posts')).body.posts.length, 2);

    await post(carol, url, { reason: 'harassment' });
    assert.equal((await get(alice, '/api/posts')).body.posts.length, 2); // two reports: still visible

    await post(dave, url, { reason: 'other' });
    assert.equal((await get(alice, '/api/posts')).body.posts.length, 0); // three reports: hidden with its reposts
    assert.equal((await get(alice, `/api/posts/${item._id}`)).status, 404);
  });

  it('shares a post to a chat as a message with a post card', async () => {
    const chat = await startDirect(alice, bob);
    const original = await makePost(carol, 'look at this');

    const res = await post(alice, `/api/posts/${original._id}/share`, {
      conversationIds: [chat._id],
      text: 'check this',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.sent, 1);

    const history = await get(bob, `/api/conversations/${chat._id}/messages`);
    const message = history.body.messages[0];

    assert.equal(message.content, 'check this');
    assert.equal(message.sharedPost.post, original._id.toString());
    assert.equal(message.sharedPost.caption, 'look at this');
    assert.equal(message.sharedPost.authorName, 'carol');
    assert.equal(message.sharedPost.imageCount, 1);
    assert.ok(message.sharedPost.imageUrl.includes('sample.jpg'));
  });

  it('shares without a message, and to several chats at once', async () => {
    const chatWithBob = await startDirect(alice, bob);
    const chatWithCarol = await startDirect(alice, carol);
    const original = await makePost(bob);

    const res = await post(alice, `/api/posts/${original._id}/share`, {
      conversationIds: [chatWithBob._id, chatWithCarol._id],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.sent, 2);

    const history = await get(carol, `/api/conversations/${chatWithCarol._id}/messages`);
    assert.equal(history.body.messages.length, 1);
    assert.equal(history.body.messages[0].content, '');
    assert.ok(history.body.messages[0].sharedPost);
  });

  it('refuses chats that are not yours and sends nothing', async () => {
    const chat = await startDirect(alice, bob);
    const original = await makePost(alice);

    const res = await post(carol, `/api/posts/${original._id}/share`, { conversationIds: [chat._id] });
    assert.equal(res.status, 404);

    const history = await get(alice, `/api/conversations/${chat._id}/messages`);
    assert.equal(history.body.messages.length, 0);
  });

  it('refuses a share with no chats or too many chats', async () => {
    const original = await makePost(alice);
    const url = `/api/posts/${original._id}/share`;

    assert.equal((await post(bob, url, { conversationIds: [] })).status, 400);

    const many = Array.from({ length: 6 }, () => new mongoose.Types.ObjectId().toString());
    assert.equal((await post(bob, url, { conversationIds: many })).status, 400);
  });

  it('removes everything an account owns when it is deleted', async () => {
    const aliceThing = await makePost(alice, 'alice post');
    await makePost(bob, 'bob post');

    await post(bob, `/api/posts/${aliceThing._id}/like`);
    await post(bob, `/api/posts/${aliceThing._id}/comments`, { text: 'from bob' });
    await post(bob, `/api/posts/${aliceThing._id}/repost`);

    const gone = await request(app)
      .delete('/api/profile')
      .set(authHeader(bob))
      .send({ password: bob.password });
    assert.equal(gone.status, 200);

    const feed = await get(alice, '/api/posts');
    assert.deepEqual(captions(feed), ['alice post']);
    assert.equal(feed.body.posts[0].likeCount, 0);
    assert.equal(feed.body.posts[0].commentCount, 0);
    assert.equal(feed.body.posts[0].repostCount, 0);
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
