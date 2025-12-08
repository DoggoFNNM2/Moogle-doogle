const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const gamesRouter = require('./routes/games');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api', gamesRouter(io));

// Fallback to index.html for root
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Moogle Doogle server running on port ${port}`);
});