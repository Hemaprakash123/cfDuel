const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    settings: {
        problemCount: { type: Number, required: true },
        minDifficulty: { type: Number, required: true },
        maxDifficulty: { type: Number, required: true },
        timer: { type: Number, required: true } // in minutes
    },
    status: { type: String, default: 'waiting' }, // waiting, in-progress, finished
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);