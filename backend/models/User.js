const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  codeforcesUsername: { type: String, required: true, unique: true, trim: true },
  currentRoomId: { type: String, default: null },
  socketId: { type: String, default: '' },
  handle: { type: String, default: '' }, 
  roomName: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
