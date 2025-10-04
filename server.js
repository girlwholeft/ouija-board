// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Simple rooms health endpoint
app.get('/rooms', (req, res) => {
  const rooms = [];
  for (let [id, s] of io.of("/").adapter.rooms) {
    // exclude individual socket rooms
    if (!io.sockets.sockets.get(id)) rooms.push(id);
  }
  res.json({ rooms });
});

io.on('connection', socket => {
  // join room
  socket.on('join', ({ room, name }) => {
    socket.join(room);
    socket.data.name = name || 'Anon';
    // notify room
    io.to(room).emit('presence', {
      players: Array.from(io.sockets.adapter.rooms.get(room) || []).map(id => {
        const s = io.sockets.sockets.get(id);
        return { id, name: s?.data?.name || 'Anon' };
      })
    });
  });

  // planchette lock acquire
  socket.on('acquirePointer', ({ room }) => {
    const lockKey = `pointerLock:${room}`;
    // naive server-side lock in memory (per server instance)
    if (!io.of("/").data) io.of("/").data = {};
    const data = io.of("/").data;
    if (!data[lockKey] || data[lockKey] === socket.id) {
      data[lockKey] = socket.id;
      io.to(room).emit('pointerLocked', { owner: socket.id });
    } else {
      socket.emit('pointerLockFailed', { owner: data[lockKey] });
    }
  });

  socket.on('releasePointer', ({ room }) => {
    const lockKey = `pointerLock:${room}`;
    if (io.of("/").data && io.of("/").data[lockKey] === socket.id) {
      delete io.of("/").data[lockKey];
      io.to(room).emit('pointerReleased');
    }
  });

  // planchette position updates
  socket.on('pointerMove', ({ room, x, y }) => {
    // basic validation
    if (typeof x !== 'number' || typeof y !== 'number') return;
    io.to(room).emit('pointerMove', { id: socket.id, x, y });
  });

  // typing events (from on-screen keyboard or chat)
  socket.on('type', ({ room, text }) => {
    // sanitize small: trim and cap length
    if (typeof text !== 'string') return;
    const payload = text.trim().slice(0, 200);
    io.to(room).emit('type', { id: socket.id, text: payload, name: socket.data.name });
  });

  // disconnect
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      // broadcast presence update after a short delay on disconnect
      setTimeout(() => {
        io.to(room).emit('presence', {
          players: Array.from(io.sockets.adapter.rooms.get(room) || []).map(id => {
            const s = io.sockets.sockets.get(id);
            return { id, name: s?.data?.name || 'Anon' };
          })
        });
      }, 100);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));