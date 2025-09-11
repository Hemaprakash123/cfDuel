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

        // Initialize in-memory state for the room
        const roomState = req.app.get('roomState');
        roomState.set(roomId, {
            started: false,
            problems,
            currentProblemIndex: 0,
            scores: Object.fromEntries(scores),
            solved: new Set(),
            nextProblemTimer: null,
        });

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

        const roomState = req.app.get('roomState');
        const state = roomState.get(roomId);

        if (!room.participants.some(p => p.equals(req.user.id))) {
            room.participants.push(req.user.id);
            room.scores.set(user.username, 0);
            if (state && typeof state.scores === 'object') {
                state.scores[user.username] = 0;
            }
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

            setTimeout(async () => {
                try {
                    const updatedRoom = await Room.findOne({ roomId });
                    if (updatedRoom) {
                        if (state) {
                            state.started = true;
                        }
                        io.to(roomId).emit('new-problem', updatedRoom.problems[updatedRoom.currentProblemIndex]);
                        io.to(roomId).emit('notification', 'The contest has started!');
                    }
                } catch (err) {
                    console.error("Error in contest start timeout:", err);
                }
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
    if (!roomId) return res.status(400).json({ msg: 'Room ID required' });

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ msg: 'Room not found' });

    if (!room.contestIsActive) return res.status(400).json({ msg: 'This contest has already finished.' });

    const state = req.app.get('roomState').get(roomId);
    if (!state || !state.started) return res.status(400).json({ msg: 'Contest has not started yet.' });

    const user = await User.findById(req.user.id).select('username codeforcesUsername');
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const handle = user.codeforcesUsername || user.username;
    if (!handle) return res.status(400).json({ msg: 'Please set your Codeforces handle in your profile to verify.' });

    const prob = state.problems[state.currentProblemIndex];
    if (!prob) return res.status(404).json({ msg: 'There is no active problem in this room.' });

    const key = `${user.username}#${prob.contestId}${prob.index}`;
    if (state.solved.has(key)) return res.json({ msg: 'You have already solved this problem.' });

    // Query Codeforces for recent submissions
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

    const acceptedSubmission = (cfRes.data.result || []).find(sub =>
      sub.verdict === 'OK' &&
      String(sub.problem?.contestId) === String(prob.contestId) &&
      String(sub.problem?.index) === String(prob.index)
    );

    if (!acceptedSubmission) {
      // emit notification and report back
      const io = req.app.get('io');
      io.to(roomId).emit('notification', `${user.username}'s verification failed (No accepted solution found).`);
      return res.status(400).json({ msg: 'No accepted submission was found for this problem.' });
    }

    // Award: update in-memory state first
    state.solved.add(key);
    state.scores[user.username] = (state.scores[user.username] || 0) + (prob.points || 100);

    // Persist the updated scores to DB immediately
    try {
      const roomDocForUpdate = await Room.findOne({ roomId });
      if (roomDocForUpdate) {
        roomDocForUpdate.scores.set(user.username, state.scores[user.username]);
        await roomDocForUpdate.save();
      }
    } catch (dbErr) {
      console.error('Failed to persist scores to DB for room', roomId, dbErr);
      // This is a non-critical error, so we don't send a 500 response.
      // The in-memory state is correct, so the contest can continue.
    }

    // Notify clients
    const io = req.app.get('io');
    io.to(roomId).emit('notification', `${user.username} solved "${prob.name}"!`);
    io.to(roomId).emit('score-update', state.scores);
    io.to(roomId).emit('problem-solved', { username: user.username, problem: prob });

    // Schedule next problem (persist nextProblem into DB before emit)
    if (!state.nextProblemTimer) {
      const NEXT_PROBLEM_DELAY = 15000;
      io.to(roomId).emit('notification', `Next problem in ${NEXT_PROBLEM_DELAY / 1000} seconds...`);

      state.nextProblemTimer = setTimeout(async () => {
        try {
          state.nextProblemTimer = null;
          state.currentProblemIndex += 1;
          const nextProblem = state.problems[state.currentProblemIndex];

          if (nextProblem) {
            // reset per-problem solved set
            state.solved = new Set();

            // Persist the next problem into DB so reconnects see the active problem
            await Room.findOneAndUpdate(
              { roomId },
              { $set: { currentProblem: nextProblem, problemSetAt: new Date(), scores: state.scores } },
              { new: true }
            ).exec();

            io.to(roomId).emit('notification', 'A new problem has been assigned!');
            io.to(roomId).emit('new-problem', nextProblem);
          } else {
            // No next problem -> finish contest, persist final state
            state.started = false;
            await Room.findOneAndUpdate(
              { roomId },
              {
                $set: {
                  contestIsActive: false,
                  contestEndTime: new Date(),
                  currentProblem: null,
                  problemSetAt: null,
                  scores: state.scores
                }
              }
            ).exec();

            io.to(roomId).emit('notification', 'Contest Finished! Well done!');
            io.to(roomId).emit('contest-finished', { scores: state.scores });
          }
        } catch (err) {
          console.error('Error in next problem timer:', err);
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
