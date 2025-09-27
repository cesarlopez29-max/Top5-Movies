const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const GameRoom = require('./models/GameRoom');

const app = express();
app.use(cors()); // Usar cors sin opciones específicas es más permisivo y bueno para empezar

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Permite todas las conexiones
    methods: ["GET", "POST"]
  }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

app.get('/search-movies', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json({ results: [] });
    try {
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX', query: query }
        });
        res.json(response.data.results.slice(0, 5));
    } catch (error) {
        res.status(500).json({ error: 'Error al buscar películas' });
    }
});

io.on('connection', (socket) => {
  socket.on('createRoom', async ({ playerName, targetScore }) => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    try {
        const newRoom = new GameRoom({
            roomCode,
            targetScore,
            players: [{ id: socket.id, name: playerName, score: 0 }]
        });
        await newRoom.save();
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('updatePlayers', newRoom.players);
    } catch (error) {
        socket.emit('error', 'No se pudo crear la sala.');
    }
  });
  // Aquí iría el resto de la lógica de Socket.IO (joinRoom, startGame, etc.)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));