const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json()); // Allows us to accept JSON data in the body

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected...'))
.catch(err => console.log(err));

// --- API Routes ---
app.get('/', (req, res) => {
    res.send('BlitzCup API is running...');
});

app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/profile', require('./routes/profile.js'));
app.use('/api/rooms', require('./routes/room.js'));

// --- Start Server ---
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));