const mongoose = require('mongoose');

const ProblemSchema = new mongoose.Schema({
  contestId: { type: Number },
  index: { type: String },
  name: { type: String },
  url: { type: String },
  tags: [{ type: String }],
  points: { type: Number }
}, { _id: false });

const ChatMessageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  settings: {
    problemCount: { type: Number, required: true },
    minDifficulty: { type: Number, required: true },
    maxDifficulty: { type: Number, required: true },
    timer: { type: Number, required: true } // minutes
  },
  problems: { type: [ProblemSchema], default: [] },
  scores: {
      type: Map,
      of: Number,
      default: {}
  },
  solvedProblems: {
      type: Map,
      of: [String],
      default: {}
  },
  chat: { type: [ChatMessageSchema], default: [] },
  currentProblemIndex: { type: Number, default: 0 },
  contestStartTime: { type: Date },
  contestIsActive: { type: Boolean, default: true }, 
  contestEndTime: { type: Date, default: null },   
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);
