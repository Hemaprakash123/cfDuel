const mongoose = require('mongoose');

const ProblemSchema = new mongoose.Schema({
  contestId: { type: Number },
  index: { type: String },
  name: { type: String },
  url: { type: String },
  tags: [{ type: String }],
  points: { type: Number }
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
  // --- UPDATED FIELDS ---
  // Replaces the 'status' field for better clarity.
  contestIsActive: { type: Boolean, default: true }, 
  // Records the exact time the contest concluded.
  contestEndTime: { type: Date, default: null },   
  // --- END UPDATED FIELDS ---
  currentProblem: { type: ProblemSchema, default: null },
  problemSetAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);
