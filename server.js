const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const GameRoom = require('./models/GameRoom');

const app = express();
app.use(cors()); // Permite conexiones desde otros dominios

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Acepta conexiones de cualquier origen
    methods: ["GET", "POST"]
  }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Endpoint para la búsqueda de películas con autocompletado
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

// Lógica principal del juego
io.on('connection', (socket) => {
    console.log(`Nuevo jugador conectado: ${socket.id}`);

    socket.on('createRoom', async ({ playerName, targetScore }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        try {
            const newRoom = new GameRoom({
                roomCode,
                targetScore: parseInt(targetScore, 10),
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

    socket.on('joinRoom', async ({ roomCode, playerName }) => {
        try {
            const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
            if (room) {
                room.players.push({ id: socket.id, name: playerName, score: 0 });
                await room.save();
                socket.join(roomCode);
                socket.emit('joinedRoom', { roomCode });
                io.to(roomCode).emit('updatePlayers', room.players);
            } else {
                socket.emit('error', 'La sala no existe.');
            }
        } catch (error) {
            socket.emit('error', 'Error al unirse a la sala.');
        }
    });

    socket.on('startGame', ({ roomCode }) => {
        startNewRound(roomCode);
    });

    socket.on('submitSelection', async ({ roomCode, selection }) => {
        try {
            const room = await GameRoom.findOne({ roomCode });
            if (!room) return;
            
            // Guardar la selección del jugador (esta parte es conceptual y se puede mejorar)
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.currentSelection = selection.filter(movie => movie.trim() !== '');
            }
            
            // Contar cuántos jugadores han enviado su selección
            let selectionsCount = room.players.filter(p => p.currentSelection && p.currentSelection.length > 0).length;
            
            io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: room.players.length });

            if (selectionsCount === room.players.length) {
                calculateResults(roomCode);
            }
        } catch (error) {
            console.error(error);
        }
    });

    socket.on('disconnect', async () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        // Lógica para eliminar al jugador de la sala en la base de datos
    });
});

async function startNewRound(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;

        // Limpiar selecciones anteriores
        room.players.forEach(p => p.currentSelection = []);

        // Obtener un actor popular de TMDb
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const peopleResponse = await axios.get(`${'https://api.themoviedb.org/3'}/person/popular`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX' }
        });
        const randomPerson = peopleResponse.data.results[Math.floor(Math.random() * peopleResponse.data.results.length)];

        // Obtener las películas de esa persona
        const creditsResponse = await axios.get(`${'https://api.themoviedb.org/3'}/person/${randomPerson.id}/movie_credits`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX' }
        });

        const topMovies = creditsResponse.data.cast
            .filter(movie => movie.vote_count > 200) // Filtro para calidad
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 5)
            .map(movie => movie.title);
        
        if (topMovies.length < 5) {
            startNewRound(roomCode); // Reintentar si no tiene suficientes películas conocidas
            return;
        }

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io