const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.js');
const Room = require('../models/Room.js');
const User = require('../models/User.js');

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// @route   POST api/rooms/create
// @desc    Create a new room
router.post('/create', auth, async (req, res) => {
    const { problemCount, minDifficulty, maxDifficulty, timer } = req.body;
    try {
        let roomId;
        let roomExists = true;
        while (roomExists) {
            roomId = generateRoomId();
            const existingRoom = await Room.findOne({ roomId });
            if (!existingRoom) roomExists = false;
        }

        const newRoom = new Room({
            roomId,
            host: req.user.id,
            participants: [req.user.id],
            settings: { problemCount, minDifficulty, maxDifficulty, timer }
        });
        const room = await newRoom.save();

        // Set the user's current room
        await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });

        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/details/:roomId
// @desc    Get details of a specific room
router.get('/details/:roomId', auth, async (req, res) => {
    try {
        const room = await Room.findOne({ roomId: req.params.roomId })
                                 .populate('participants', 'username'); // Populates with username
        if (!room) {
            return res.status(404).json({ msg: 'Room not found' });
        }
        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/join
// @desc    Join an existing room
router.post('/join', auth, async (req, res) => {
    const { roomId } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        // Add user if not already a participant
        if (!room.participants.includes(req.user.id)) {
            room.participants.push(req.user.id);
            await room.save();
        }
        
        await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });
        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   POST api/rooms/leave
// @desc    Leave the current room
router.post('/leave', auth, async (req, res) => {
    const { roomId } = req.body;
    try {
        const room = await Room.findOne({ roomId });
        if (room) {
            // Remove user from participants
            room.participants = room.participants.filter(p => p.toString() !== req.user.id);
            
            // If the room is empty, delete it. Otherwise, save the updated participants.
            if (room.participants.length === 0) {
                await Room.findByIdAndDelete(room._id);
            } else {
                // If the host leaves, assign a new host (optional, simple logic for now)
                if (room.host.toString() === req.user.id) {
                    room.host = room.participants[0];
                }
                await room.save();
            }
        }
        
        // Always clear the user's current room
        await User.findByIdAndUpdate(req.user.id, { currentRoomId: null });
        res.json({ msg: 'Successfully left the room' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;