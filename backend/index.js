require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// Models & routes
const User = require('./models/User');
const Room = require('./models/Room');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const roomRoutes = require('./routes/room');

const app = express();
const allowedOrigins = [
    'http://localhost:5173',         // Your local frontend for development
    'https://blitzforces.vercel.app' // Your live frontend on Vercel
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Expose runtime state
const roomState = new Map();
const roomTimer = {}; // To hold timer intervals
app.set('io', io);
app.set('roomState', roomState);

// --- Codeforces API Helper Functions ---
const preHandle = "https://codeforces.com/api/user.info?handles=";
const endpointUserStats = "https://codeforces.com/api/user.status?handle=";
const endPointProblems = "https://codeforces.com/api/problemset.problems";
// In server.js
const pre = "https://codeforces.com/problemset/problem/";

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

async function giveRatingOfUser(handle) {
  try {
    const response = await fetch(preHandle + handle);
    const jsonResponse = await response.json();
    return jsonResponse.result[0].rating;
  } catch (err) {
    console.error(`Error fetching rating for ${handle}:`, err);
    return 1200; // Default rating on error
  }
}

async function fetchProblems(handle, solvedSet) {
  try {
    const response = await fetch(endpointUserStats + String(handle));
    const temp = await response.json();
    if (temp.status !== 'OK') return false;

    temp.result.forEach((it) => {
      if (it.verdict === "OK" && it.problem.contestId) {
        const link = pre + it.contestId + "/" + it.problem.index;
        solvedSet.add(link);
      }
    });
    return true;
  } catch (err) {
    console.error(`Error fetching problems for ${handle}:`, err);
    return false;
  }
}

async function giveProblemNotSolvedByBoth(handles, roomDoc) {
  const firstUserProblems = new Set();
  const secondUserProblems = new Set();
  
  await fetchProblems(handles[0], firstUserProblems);
  await fetchProblems(handles[1], secondUserProblems);

  const response = await fetch(endPointProblems);
  const jsonResponse = await response.json();
  if (jsonResponse.status !== 'OK') {
      throw new Error("Failed to fetch problem set from Codeforces");
  }

  const { minDifficulty, maxDifficulty } = roomDoc.settings;

  const problemsNotSolved = jsonResponse.result.problems.filter((currProblem) => {
    const link = pre + currProblem.contestId + "/" + currProblem.index;
    return (
      !firstUserProblems.has(link) &&
      !secondUserProblems.has(link) &&
      currProblem.rating >= minDifficulty &&
      currProblem.rating <= maxDifficulty
    );
  });

  if (problemsNotSolved.length === 0) return null; // No suitable problem found

  const indx = getRandomInt(problemsNotSolved.length);
  const chosenProblem = problemsNotSolved[indx];
  
  // Return a normalized problem object
  return {
      contestId: chosenProblem.contestId,
      index: chosenProblem.index,
      name: chosenProblem.name,
      url: pre + chosenProblem.contestId + "/" + chosenProblem.index,
      tags: chosenProblem.tags,
      points: chosenProblem.rating 
  };
}

function timer(minutes, roomId, eventName = 'countdown') {
    if (roomTimer[roomId]) clearInterval(roomTimer[roomId]);

    const totalSeconds = Math.max(1, Math.floor(Number(minutes) * 60));
    let remaining = totalSeconds;

    io.in(roomId).emit(eventName, { remaining });
    io.in(roomId).emit('notification', `Timer started for ${minutes} minute(s).`);

    roomTimer[roomId] = setInterval(() => {
        remaining -= 1;
        io.in(roomId).emit(eventName, { remaining });

        if (remaining <= 0) {
            clearInterval(roomTimer[roomId]);
            delete roomTimer[roomId];
            io.in(roomId).emit('time-up', { event: eventName });
            io.in(roomId).emit('notification', 'Time is up!');
        }
    }, 1000);
}


// Synchronous helper to ensure in-memory state exists for a room
function ensureStateForRoom(roomId, roomDoc) {
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      started: roomDoc ? roomDoc.currentProblem !== null : false,
      startTimer: null,
      nextProblemTimer: null,
      currentProblemIndex: 0,
      scores: {},
      solved: new Set(),
      problems: [] // This will be populated when the contest starts
    });
  }
  return roomState.get(roomId);
}

/* Socket auth middleware */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication error: token missing'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded?.user?.id || decoded?.id;
    if (!socket.userId) return next(new Error('Authentication error: invalid token payload'));
    next();
  } catch (err) {
    console.warn('Socket auth failed:', err.message);
    return next(new Error('Authentication error'));
  }
});

// --- Main Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id, 'userId:', socket.userId);

  socket.on('new-user', async (payload) => {
    try {
      const roomId = (payload?.roomId ?? '').toString().trim();
      if (!roomId) return socket.emit('notification', 'Join failed: missing roomId');

      const roomDoc = await Room.findOne({ roomId }).populate('participants', 'username codeforcesUsername');
      if (!roomDoc) return socket.emit('notification', 'Error: Room not found.');

      const state = ensureStateForRoom(roomId, roomDoc);
      const authUser = await User.findById(socket.userId);
      if (!authUser) return socket.emit('notification', 'User record not found.');

      authUser.socketId = socket.id;
      authUser.currentRoomId = roomId;
      await authUser.save();
      socket.join(roomId);

      if (!state.scores[authUser.username]) {
        state.scores[authUser.username] = 0;
      }
      io.in(roomId).emit('score-update', state.scores);
      io.in(roomId).emit('notification', `${authUser.username} connected.`);

      if (!roomDoc.contestIsActive) {
        socket.emit('contest-finished', { scores: state.scores });
        return;
      }

      if (roomDoc.currentProblem) {
        socket.emit('initial-state', {
          currentProblem: roomDoc.currentProblem,
          scores: state.scores,
          started: true
        });
        return;
      }

      const participants = roomDoc.participants;
      if (participants.length >= 2 && !state.started && !state.startTimer) {
        io.in(roomId).emit('notification', 'Two participants are here! Contest will start in 10 seconds.');
        state.startTimer = setTimeout(async () => {
          try {
            state.startTimer = null;
            state.started = true;
            
            const handles = participants.map(p => p.codeforcesUsername || p.username);
            const prob = await giveProblemNotSolvedByBoth(handles, roomDoc);

            if (!prob) {
              io.in(roomId).emit('notification', 'Could not find a suitable problem with the given criteria.');
              // Handle this case - maybe end the room or allow host to restart
              return;
            }

            // For now, let's assume we fetch one problem at a time.
            state.problems = [prob];
            state.currentProblemIndex = 0;

            roomDoc.currentProblem = prob;
            roomDoc.problemSetAt = new Date();
            await roomDoc.save();
            
            state.currentProblem = prob;
            io.in(roomId).emit('notification', 'Contest started!');
            io.in(roomId).emit('new-problem', prob);
            
            // Start the timer
            timer(roomDoc.settings.timer, roomId, 'countdown');

          } catch (err) {
            console.error('Contest start timer error:', err);
            io.in(roomId).emit('notification', 'A server error occurred while starting the contest.');
          }
        }, 10000);
      } else {
        socket.emit('notification', 'Waiting for another participant to join...');
      }

    } catch (err) {
      console.error('new-user event handler error:', err);
      socket.emit('notification', 'A server error occurred while joining the room.');
    }
  });

  // --- Event Handlers ---
  socket.on('chat-message', (payload) => {
    try {
      const roomId = payload?.roomId;
      if (roomId && socket.rooms.has(roomId)) {
        io.in(roomId).emit('chat-message', payload);
      }
    } catch (e) {
      console.warn('Error forwarding chat message:', e);
    }
  });

  socket.on('leave-room', async ({ roomId }) => {
    try {
      if (!roomId) return;
      socket.leave(roomId);
      const user = await User.findById(socket.userId);
      if (user) {
        const state = roomState.get(roomId);
        if (state && user.username) {
          delete state.scores[user.username];
          io.in(roomId).emit('score-update', state.scores);
        }
        io.in(roomId).emit('notification', `${user.username || 'A user'} left the room.`);
      }
    } catch (e) {
      console.error('leave-room socket handler error:', e);
    }
  });

  socket.on('disconnect', async () => {
    try {
      const user = await User.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
      if (user && user.currentRoomId) {
        const roomId = user.currentRoomId;
        const state = roomState.get(roomId);
        if (state && user.username) {
          delete state.scores[user.username];
          io.in(roomId).emit('score-update', state.scores);
        }
        io.in(roomId).emit('notification', `${user.username || 'A user'} disconnected.`);
      }
    } catch (err){
      console.error('disconnect handler error:', err);
    }
  });

});

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/rooms', roomRoutes);

// Start server
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => server.listen(PORT, () => console.log(`Server listening on ${PORT}`)))
  .catch(err => console.error('Mongo connection error', err));
