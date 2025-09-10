const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const User =require('../models/User');
const axios = require('axios');

// Helper function to generate a unique room ID
const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Helper function to fetch problems from Codeforces
const fetchProblemsFromCodeforces = async (count, minRating, maxRating) => {
    try {
        const response = await axios.get('https://codeforces.com/api/problemset.problems');
        if (response.data.status !== 'OK') {
            throw new Error('Failed to fetch problems from Codeforces API.');
        }
        const allProblems = response.data.result.problems;
        const filtered = allProblems.filter(p =>
            p.rating >= minRating && p.rating <= maxRating && !p.tags.includes('*special')
        );
        const shuffled = filtered.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).map(p => ({
            contestId: p.contestId,
            index: p.index,
            name: p.name,
            url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
            tags: p.tags,
            points: p.rating || 100
        }));
    } catch (error) {
        console.error("Error fetching problems from Codeforces:", error.message);
        return [];
    }
};

// @route   POST api/rooms/create
// @desc    Create a new contest room
// @access  Private
router.post('/create', auth, async (req, res) => {
    try {
        const { problemCount = 4, minDifficulty = 800, maxDifficulty = 1500, timer = 60 } = req.body;

        const problems = await fetchProblemsFromCodeforces(Number(problemCount), Number(minDifficulty), Number(maxDifficulty));
        if (problems.length < problemCount) {
            return res.status(400).json({ msg: `Could only fetch ${problems.length} problems with the specified criteria. Please adjust settings.` });
        }

        let roomId;
        do {
            roomId = generateRoomId();
        } while (await Room.findOne({ roomId }));

        const user = await User.findById(req.user.id).select('username');
        const scores = new Map([[user.username, 0]]);

        const newRoom = new Room({
            roomId,
            host: req.user.id,
            participants: [req.user.id],
            settings: { problemCount, minDifficulty, maxDifficulty, timer },
            problems,
            scores,
            currentProblemIndex: 0,
        });

        const room = await newRoom.save();
        await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });
        res.json(room);

    } catch (err) {
        console.error('Create room error:', err);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/details/:roomId
// @desc    Get details for a specific room, including chat and scores
// @access  Private
router.get('/details/:roomId', auth, async (req, res) => {
    try {
        const room = await Room.findOne({ roomId: req.params.roomId })
            .populate('participants', 'username');

        if (!room) {
            return res.status(404).json({ msg: 'Room not found' });
        }
        res.json(room);
    } catch (err) {
        console.error('Get room details error:', err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/join
// @desc    Join an existing room
// @access  Private
router.post('/join', auth, async (req, res) => {
    try {
        const { roomId } = req.body;
        const room = await Room.findOne({ roomId });
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const user = await User.findById(req.user.id).select('username');

        if (!room.participants.some(p => p.equals(req.user.id))) {
            room.participants.push(req.user.id);
            room.scores.set(user.username, 0);
        }

        let contestIsStarting = false;
        if (!room.contestStartTime && room.participants.length >= 2) {
            room.contestStartTime = new Date();
            contestIsStarting = true;
        }

        await room.save();

        if (contestIsStarting) {
            const io = req.io;
            io.to(roomId).emit('notification', 'A second player has joined! The contest will start in 15 seconds.');

            setTimeout(() => {
                // Refetch the room to be safe, though it should be in scope
                Room.findOne({ roomId }).then(updatedRoom => {
                    if (updatedRoom) {
                        io.to(roomId).emit('new-problem', updatedRoom.problems[updatedRoom.currentProblemIndex]);
                        io.to(roomId).emit('notification', 'The contest has started!');
                    }
                }).catch(err => console.error("Error in contest start timeout:", err));
            }, 15000);
        }
        await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });
        res.json(room);

    } catch (err) {
        console.error('Join room error:', err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/leave
// @desc    Leave the current room
// @access  Private
router.post('/leave', auth, async (req, res) => {
    try {
        const { roomId } = req.body;
        const room = await Room.findOne({ roomId });

        if (room) {
            room.participants = room.participants.filter(p => !p.equals(req.user.id));
            if (room.participants.length === 0) {
                await Room.findByIdAndDelete(room._id);
            } else {
                if (room.host.equals(req.user.id)) {
                    room.host = room.participants[0];
                }
                await room.save();
            }
        }

        await User.findByIdAndUpdate(req.user.id, { currentRoomId: null });
        res.json({ msg: 'Successfully left the room' });
    } catch (err) {
        console.error('Leave room error:', err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/verify
// @desc    Verify a user's solution and update contest state
// @access  Private
router.post('/verify', auth, async (req, res) => {
    try {
        const { roomId } = req.body;
        const room = await Room.findOne({ roomId });

        if (!room || !room.contestIsActive || !room.contestStartTime) {
            return res.status(400).json({ msg: 'Contest is not active.' });
        }

        const user = await User.findById(req.user.id).select('username codeforcesUsername');
        const handle = user.codeforcesUsername || user.username;
        if (!handle) return res.status(400).json({ msg: 'Please set your Codeforces handle in your profile.' });

        const prob = room.problems[room.currentProblemIndex];
        if (!prob) return res.status(404).json({ msg: 'No active problem in this room.' });

        const url = `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=50`;
        const cfRes = await axios.get(url, { timeout: 10000 });

        if (cfRes.data.status !== 'OK') {
            return res.status(502).json({ msg: `Codeforces API Error: ${cfRes.data.comment}` });
        }

        const isSolved = cfRes.data.result.some(s =>
            s.verdict === 'OK' &&
            s.problem.contestId === prob.contestId &&
            s.problem.index === prob.index
        );

        if (!isSolved) {
            return res.status(400).json({ msg: 'No accepted submission found for this problem.' });
        }

        const problemId = `${prob.contestId}-${prob.index}`;
        const solversForCurrentProblem = new Set(room.solvedProblems.get(problemId) || []);

        if (solversForCurrentProblem.has(user.username)) {
            return res.json({ msg: 'You have already solved this problem.' });
        }

        // Add user to the list of solvers for this problem and update score
        solversForCurrentProblem.add(user.username);
        room.solvedProblems.set(problemId, Array.from(solversForCurrentProblem));
        room.scores.set(user.username, (room.scores.get(user.username) || 0) + (prob.points || 100));

        const io = req.app.get('io');
        io.to(roomId).emit('notification', `${user.username} solved "${prob.name}"!`);
        io.to(roomId).emit('score-update', Object.fromEntries(room.scores));

        // Check if all active participants have solved it
        const allParticipants = await User.find({ '_id': { $in: room.participants } }).select('username');
        const allUsernames = allParticipants.map(u => u.username);
        const allHaveSolved = allUsernames.every(u => solversForCurrentProblem.has(u));

        if (allHaveSolved) {
            room.currentProblemIndex += 1;
            if (room.currentProblemIndex >= room.problems.length) {
                room.contestIsActive = false;
                room.contestEndTime = new Date();
                io.to(roomId).emit('notification', 'Contest Finished! All problems solved.');
                io.to(roomId).emit('contest-finished', { scores: Object.fromEntries(room.scores) });
            } else {
                io.to(roomId).emit('notification', 'Next problem unlocked!');
                io.to(roomId).emit('new-problem', room.problems[room.currentProblemIndex]);
            }
        }

        await room.save();
        res.json({ msg: 'Solution verified successfully!', scores: Object.fromEntries(room.scores) });

    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
