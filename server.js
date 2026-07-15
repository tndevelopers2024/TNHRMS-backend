const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this if you want to restrict origins
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.set('io', io);

// Basic Socket Events
io.on('connection', (socket) => {
  const { userId, role } = socket.handshake.query;
  console.log('New WebSocket connection:', socket.id, 'User:', userId, 'Role:', role);

  if (userId) {
    socket.join(userId);
  }
  if (role === 'admin') {
    socket.join('admin');
  }

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected:', socket.id);
  });
});

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employee', require('./routes/employee'));

// Initialize Cron Jobs
const initCronJobs = require('./cronJobs');
initCronJobs();

// Test Route
app.get('/', (req, res) => {
  res.send('HRMS Backend is running');
});

// Database Connection
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tn-hrms')
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err.message);
  });
