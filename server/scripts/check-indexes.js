// Read-only check: does MongoDB use an index for our most important queries?
// Run it with:  node scripts/check-indexes.js
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Conversation from '../models/Conversation.js';
import ConversationState from '../models/ConversationState.js';
import Message from '../models/Message.js';
import Story from '../models/Story.js';
import User from '../models/User.js';

const stagesOf = (explained) => {
  const found = JSON.stringify(explained.queryPlanner.winningPlan).match(/"stage":"[A-Z_]+"/g) || [];
  return [...new Set(found.map((item) => item.slice(9, -1)))];
};

const verdict = (stages) => {
  if (stages.includes('COLLSCAN')) return '⚠️  reads EVERYTHING (needs an index)';
  if (stages.includes('SORT')) return '🟡 uses an index, then sorts in memory';
  return '✅ uses an index';
};

const check = async (name, query) => {
  try {
    const stages = stagesOf(await query.explain('queryPlanner'));
    console.log(`${verdict(stages)}  ${name}  [${stages.join(' > ')}]`);
  } catch (error) {
    console.log(`❓ ${name}: could not check (${error.message})`);
  }
};

await mongoose.connect(env.mongoUri);

console.log('\nINDEXES THAT EXIST');
for (const model of [User, Conversation, ConversationState, Message, Story]) {
  const indexes = await model.collection.indexes();
  console.log(`  ${model.modelName}: ${indexes.map((index) => index.name).join(', ')}`);
}

const conversation = await Conversation.findOne().lean();
const user = await User.findOne({ deletedAt: null }).lean();

if (!conversation || !user) {
  console.log('\nThe database is empty, so there is nothing to check.');
} else {
  console.log('\nQUERY PLANS');

  await check('latest messages of a chat', Message.find({ conversation: conversation._id }).sort({ _id: -1 }).limit(31));
  await check(
    'older messages (paging)',
    Message.find({ conversation: conversation._id, _id: { $lt: new mongoose.Types.ObjectId() } }).sort({ _id: -1 }).limit(31)
  );
  await check('my chat list', Conversation.find({ members: user._id }).sort({ lastMessageAt: -1 }));
  await check(
    'message search',
    Message.find({ $text: { $search: 'hello' }, conversation: { $in: [conversation._id] } })
  );
  await check('login by email', User.findOne({ email: user.email }));
  await check(
    'stories feed',
    Story.find({ author: { $in: [user._id] }, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 })
  );
  await check('expired stories cleanup', Story.find({ expiresAt: { $lte: new Date() } }));
}

await mongoose.disconnect();
