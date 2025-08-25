const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  codeforcesUsername: {
    type: String,
    required: true,
    trim: true,
  },
  matchHistory: {
    type: Array,
    default: [],
  },
  currentRoomId: { type: String, default: null },
  date: {
    type: Date,
    default: Date.now,
  }
},{timestamps: true});

module.exports = mongoose.model('User', UserSchema);