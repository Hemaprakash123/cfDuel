require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');

// Models & routes
const User = require('./models/User');
const Room = require('./models/Room');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const roomRoutes = require('./routes/room');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Expose runtime state
const roomState = new Map();
app.set('io', io);
app.set('roomState', roomState);

// Synchronous helper to ensure in-memory state exists for a room
function ensureStateForRoom(roomId, roomDoc) {
  if (!roomState.has(roomId)) {
    const problemCount = roomDoc?.settings?.problemCount || 3;
    const problems = []; // In a real app, you'd populate this based on settings
    roomState.set(roomId, {
      started: roomDoc ? roomDoc.currentProblem !== null : false,
      startTimer: null,
      nextProblemTimer: null,
      currentProblemIndex: 0,
      scores: {},
      solved: new Set(),
      problems
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

      const roomDoc = await Room.findOne({ roomId }).populate('participants', 'username');
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
            
            // Placeholder for your problem-picking logic
            const prob = { contestId: 1, index: 'A', name: 'Theatre Square', url: 'https://codeforces.com/problemset/problem/1/A', points: 100 };

            if (!prob) {
              return io.in(roomId).emit('notification', 'Could not find a suitable problem.');
            }

            roomDoc.currentProblem = prob;
            roomDoc.problemSetAt = new Date();
            await roomDoc.save();
            
            state.currentProblem = prob;
            io.in(roomId).emit('notification', 'Contest started!');
            io.in(roomId).emit('new-problem', prob);

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

  // --- ADDED EVENT HANDLERS ---

  // Forwards chat messages to all users in the room.
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

  // Handles a user explicitly clicking "Quit Room".
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

  // Handles unexpected disconnects (e.g., closing the browser tab).
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
    } catch (err) {
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
