const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const GameRoom = require('./models/GameRoom');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
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
    console.log(`Nuevo jugador conectado: ${socket.id}`);

    socket.on('createRoom', async ({ playerName, targetScore }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        try {
            const newRoom = new GameRoom({
                roomCode,
                targetScore: parseInt(targetScore, 10),
                players: [{ id: socket.id, name: playerName, score: 0, currentSelection: [] }]
            });
            await newRoom.save();
            socket.join(roomCode);
            socket.emit('roomCreated', { roomCode });
            io.to(roomCode).emit('updatePlayers', newRoom.players);
        } catch (error) {
            console.error(error);
            socket.emit('error', 'No se pudo crear la sala.');
        }
    });

    socket.on('joinRoom', async ({ roomCode, playerName }) => {
        try {
            const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
            if (room) {
                room.players.push({ id: socket.id, name: playerName, score: 0, currentSelection: [] });
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
            
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.currentSelection = selection.filter(movie => movie && movie.trim() !== '');
            }
            
            await room.save();
            
            const selectionsCount = room.players.filter(p => p.currentSelection && p.currentSelection.length > 0).length;
            
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
        // Aquí iría la lógica para eliminar al jugador de la sala en la DB
    });
});

async function startNewRound(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;

        room.players.forEach(p => { p.currentSelection = []; });
        
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX', page: Math.floor(Math.random() * 10) + 1 }
        });
        const randomPerson = peopleResponse.data.results[Math.floor(Math.random() * peopleResponse.data.results.length)];

        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX' }
        });

        const topMovies = creditsResponse.data.cast
            .filter(movie => movie.vote_count > 200)
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 5)
            .map(movie => movie.title);
        
        if (topMovies.length < 5) {
            return startNewRound(roomCode);
        }

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io.to(roomCode).emit('newRound', { actorName: randomPerson.name });
    } catch (error) {
        console.error('Error al iniciar nueva ronda:', error);
    }
}

async function calculateResults(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;

        const correctMovies = room.currentActor.topMovies;
        const roundScores = [];

        room.players.forEach(player => {
            const hits = player.currentSelection.filter(movie => correctMovies.includes(movie)).length;
            roundScores.push({ player, hits, selection: player.currentSelection });
        });

        roundScores.sort((a, b) => b.hits - a.hits);
        
        if (roundScores[0]) roundScores[0].player.score += 3;
        if (roundScores[1]) roundScores[1].player.score += 2;
        if (roundScores[2]) roundScores[2].player.score += 1;
        
        io.to(roomCode).emit('roundResult', { 
            correctMovies, 
            playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), 
            updatedPlayers: room.players 
        });

        const winner = room.players.find(p => p.score >= room.targetScore);
        if (winner) {
            io.to(roomCode).emit('gameOver', { winnerName: winner.name });
        } else {
            setTimeout(() => startNewRound(roomCode), 10000);
        }
        await room.save();
    } catch (error) {
        console.error('Error calculando resultados:', error);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));