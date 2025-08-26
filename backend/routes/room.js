const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Ensure this path is correct for your project
const Room = require('../models/Room');
const User = require('../models/User');
const axios = require('axios');

// --- Helper Functions ---

// Generates a random 6-character uppercase string for a new room ID.
const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// --- Room API Routes ---

/**
 * @route   POST api/rooms/create
 * @desc    Create a new contest room
 * @access  Private
 */
router.post('/create', auth, async (req, res) => {
  try {
    const { problemCount = 3, minDifficulty = 800, maxDifficulty = 1200, timer = 60 } = req.body;
    
    // Ensure a unique roomId is generated.
    let roomId;
    do {
      roomId = generateRoomId();
    } while (await Room.findOne({ roomId }));

    const newRoom = new Room({
      roomId,
      host: req.user.id,
      participants: [req.user.id],
      settings: { 
        problemCount: Number(problemCount), 
        minDifficulty: Number(minDifficulty), 
        maxDifficulty: Number(maxDifficulty), 
        timer: Number(timer) 
      },
      // contestIsActive is true by default from the schema
    });

    const room = await newRoom.save();
    await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });

    // Initialize the in-memory state for the new room.
    const stateMap = req.app.get('roomState');
    if (!stateMap.has(roomId)) {
      // In a real app, you would fetch problems from an API here based on settings.
      // For now, we use a placeholder.
      const problems = []; 
      stateMap.set(roomId, { 
        started: false, 
        startTimer: null, 
        nextProblemTimer: null, 
        currentProblemIndex: 0, 
        scores: {}, 
        solved: new Set(), 
        problems 
      });
    }

    res.json(room);
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET api/rooms/details/:roomId
 * @desc    Get details for a specific room
 * @access  Private
 */
router.get('/details/:roomId', auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId }).populate('participants', 'username');
    if (!room) {
      return res.status(404).json({ msg: 'Room not found' });
    }
    res.json(room);
  } catch (err) {
    console.error('Get room details error:', err);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST api/rooms/join
 * @desc    Join an existing room
 * @access  Private
 */
router.post('/join', auth, async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ msg: 'Room ID is required' });

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ msg: 'Room not found' });

    // Add user to participants list if they are not already in it.
    if (!room.participants.some(p => p.toString() === req.user.id)) {
      room.participants.push(req.user.id);
      await room.save();
    }
    await User.findByIdAndUpdate(req.user.id, { currentRoomId: roomId });
    
    res.json(room);
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST api/rooms/leave
 * @desc    Leave the current room
 * @access  Private
 */
router.post('/leave', auth, async (req, res) => {
  try {
    const { roomId } = req.body;
    const room = await Room.findOne({ roomId });

    if (room) {
      // Remove the user from the participants array.
      room.participants = room.participants.filter(p => p.toString() !== req.user.id);
      
      if (room.participants.length === 0) {
        // If the room is empty, delete it from the database.
        await Room.findByIdAndDelete(room._id);
        const stateMap = req.app.get('roomState');
        const state = stateMap.get(roomId);
        if (state) {
          if (state.startTimer) clearTimeout(state.startTimer);
          if (state.nextProblemTimer) clearTimeout(state.nextProblemTimer);
          stateMap.delete(roomId);
        }
      } else {
        // If other participants remain, reassign the host if the current host is leaving.
        if (room.host && room.host.toString() === req.user.id) {
          room.host = room.participants[0];
        }
        await room.save();
      }
    }
    
    // Clear the user's current room assignment.
    await User.findByIdAndUpdate(req.user.id, { currentRoomId: null });
    res.json({ msg: 'Successfully left the room' });
  } catch (err) {
    console.error('Leave room error:', err);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST api/rooms/verify
 * @desc    Verify a user's solution, award points, and manage contest flow.
 * @access  Private
 */
router.post('/verify', auth, async (req, res) => {
  try {
    const { roomId } = req.body;
    
    // Check the definitive contest status from the database first.
    const room = await Room.findOne({ roomId });
    if (room && !room.contestIsActive) {
      return res.status(400).json({ msg: 'This contest has already finished.' });
    }

    const io = req.app.get('io');
    const state = req.app.get('roomState').get(roomId);

    if (!state || !state.started) {
      return res.status(400).json({ msg: 'Contest has not started yet.' });
    }

    const user = await User.findById(req.user.id).select('username codeforcesUsername');
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const handle = user.codeforcesUsername || user.username;
    if (!handle) return res.status(400).json({ msg: 'Please set your Codeforces handle in your profile to verify.' });

    const prob = state.problems[state.currentProblemIndex];
    if (!prob) return res.status(404).json({ msg: 'There is no active problem in this room.' });

    const key = `${user.username}#${prob.contestId}${prob.index}`;
    if (state.solved.has(key)) return res.json({ msg: 'You have already solved this problem.' });

    // --- Codeforces API Interaction ---
    const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`;
    let cfRes;
    try {
      cfRes = await axios.get(url, { timeout: 10000 });
      if (cfRes.data.status !== 'OK') {
        const reason = cfRes.data.comment || 'API returned a non-OK status.';
        return res.status(502).json({ msg: `Codeforces API Error: ${reason}` });
      }
    } catch (err) {
      let errorMessage = 'Could not connect to the Codeforces API.';
      if (err.code === 'ECONNABORTED') errorMessage = 'The request to Codeforces API timed out.';
      return res.status(502).json({ msg: errorMessage });
    }

    // --- Process Submissions ---
    const acceptedSubmission = (cfRes.data.result || []).find(sub =>
      sub.verdict === 'OK' &&
      String(sub.problem?.contestId) === String(prob.contestId) &&
      String(sub.problem?.index) === String(prob.index)
    );

    if (!acceptedSubmission) {
      io.to(roomId).emit('notification', `${user.username}'s verification failed (No accepted solution found).`);
      return res.status(400).json({ msg: 'No accepted submission was found for this problem.' });
    }

    // --- Award Points and Update State ---
    state.solved.add(key);
    state.scores[user.username] = (state.scores[user.username] || 0) + (prob.points || 100);
    await Room.findOneAndUpdate({ roomId }, { $set: { currentProblem: null, problemSetAt: null } }).exec();

    io.to(roomId).emit('notification', `${user.username} solved "${prob.name}"!`);
    io.to(roomId).emit('score-update', state.scores);
    io.to(roomId).emit('problem-solved', { username: user.username, problem: prob });

    // --- Schedule the Next Problem ---
    if (!state.nextProblemTimer) {
      const NEXT_PROBLEM_DELAY = 15000;
      io.to(roomId).emit('notification', `Next problem in ${NEXT_PROBLEM_DELAY / 1000} seconds...`);

      state.nextProblemTimer = setTimeout(async () => {
        try {
            state.nextProblemTimer = null;
            state.currentProblemIndex += 1;
            const nextProblem = state.problems[state.currentProblemIndex];

            if (nextProblem) {
              state.solved = new Set();
              await Room.findOneAndUpdate({ roomId }, { $set: { currentProblem: nextProblem, problemSetAt: new Date() } }).exec();
              io.to(roomId).emit('notification', 'A new problem has been assigned!');
              io.to(roomId).emit('new-problem', nextProblem);
            } else {
              // --- End the Contest ---
              state.started = false;
              io.to(roomId).emit('notification', 'Contest Finished! Well done!');
              await Room.findOneAndUpdate({ roomId }, { 
                $set: { 
                  contestIsActive: false, 
                  contestEndTime: new Date(),
                  currentProblem: null, 
                  problemSetAt: null 
                } 
              }).exec();
            }
        } catch(err) {
            console.error("Error in next problem timer:", err);
            io.to(roomId).emit('notification', 'A server error occurred while preparing the next problem.');
        }
      }, NEXT_PROBLEM_DELAY);
    }

    return res.json({ msg: 'Solution verified successfully!', scores: state.scores });

  } catch (err) {
    console.error('An unexpected error occurred in /verify route:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
