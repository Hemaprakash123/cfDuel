require('dotenv').config();
const express = require('express');
const http = require('http');
const cors =require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Models & routes
const User = require('./models/User');
const Room = require('./models/Room');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const roomRoutes = require('./routes/room');

const app = express();
const allowedOrigins = [
    'http://localhost:5173',
    'https://blitzforces.vercel.app'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory store for room states
app.set('roomState', new Map());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Pass io instance to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

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
    return next(new Error('Authentication error'));
  }
});

// --- Main Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id, 'userId:', socket.userId);

  socket.on('join-room', async ({ roomId }) => {
    try {
        if (!roomId) return;
        socket.join(roomId);
        const user = await User.findById(socket.userId).select('username');
        io.to(roomId).emit('notification', `${user.username || 'A user'} has joined the room.`);
    } catch (error) {
        console.error('Error in join-room handler:', error);
    }
  });

  socket.on('chat-message', async (payload) => {
    try {
      const { roomId, text } = payload;
      const user = await User.findById(socket.userId).select('username');
      if (!roomId || !text || !user) return;

      const room = await Room.findOne({ roomId });
      if (!room) return;

      const message = {
          username: user.username,
          text: text,
          timestamp: new Date()
      };

      room.chat.push(message);
      await room.save();

      io.in(roomId).emit('chat-message', message);
    } catch (e) {
      console.warn('Error handling chat message:', e);
    }
  });

  socket.on('leave-room', async ({ roomId }) => {
    try {
      if (!roomId) return;
      socket.leave(roomId);
      const user = await User.findById(socket.userId).select('username');
      if (user) {
        io.in(roomId).emit('notification', `${user.username || 'A user'} left the room.`);
      }
    } catch (e) {
      console.error('leave-room socket handler error:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
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
