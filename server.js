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
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] }});

// Objeto temporal para manejar las selecciones de la ronda actual en memoria
const roomSelections = {};

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

io.on('connection', (socket) => {
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
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        // Guardar la selección en nuestro objeto temporal en memoria
        if (!roomSelections[roomCode]) {
            roomSelections[roomCode] = {};
        }
        roomSelections[roomCode][socket.id] = selection;

        const selectionsCount = Object.keys(roomSelections[roomCode]).length;
        const totalPlayers = room.players.length;

        io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: totalPlayers });

        // Comprobar si todos han votado
        if (selectionsCount === totalPlayers) {
            calculateResults(roomCode);
        }
    });

    socket.on('disconnect', async () => { console.log(`Jugador desconectado: ${socket.id}`); });
});

async function startNewRound(roomCode) {
    try {
        // Limpiar las selecciones de la ronda anterior para esta sala
        if (roomSelections[roomCode]) {
            delete roomSelections[roomCode];
        }

        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX', page: Math.floor(Math.random() * 10) + 1 }
        });
        const randomPerson = peopleResponse.data.results[Math.floor(Math.random() * peopleResponse.data.results.length)];

        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, {
            params: { api_key: TMDB_API_KEY, language: 'es-MX' }
        });
        
        const allMovies = [...new Set(creditsResponse.data.cast.map(movie => movie.title))].sort();
        const topMovies = creditsResponse.data.cast
            .filter(movie => movie.vote_count > 200)
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 5)
            .map(movie => movie.title);
        
        if (topMovies.length < 5 || allMovies.length < 5) {
            return startNewRound(roomCode);
        }

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io.to(roomCode).emit('newRound', { actorName: randomPerson.name, movieList: allMovies });
    } catch (error) {
        console.error('Error al iniciar nueva ronda:', error);
    }
}

async function calculateResults(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room || !roomSelections[roomCode]) return;

        const correctMovies = room.currentActor.topMovies;
        const selections = roomSelections[roomCode]; // Usamos las selecciones de memoria
        const roundScores = [];

        room.players.forEach(player => {
            const playerSelection = selections[player.id] || [];
            const hits = playerSelection.filter(movie => correctMovies.includes(movie)).length;
            roundScores.push({ player, hits, selection: playerSelection });
        });

        roundScores.sort((a, b) => b.hits - a.hits);
        
        if (roundScores[0] && roundScores[0].player) roundScores[0].player.score += 3;
        if (roundScores[1] && roundScores[1].player) roundScores[1].player.score += 2;
        if (roundScores[2] && roundScores[2].player) roundScores[2].player.score += 1;
        
        io.to(roomCode).emit('roundResult', { 
            correctMovies, 
            playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), 
            updatedPlayers: room.players 
        });

        const winner = room.players.find(p => p.score >= room.targetScore);
        if (winner) {
            io.to(roomCode).emit('gameOver', { winnerName: winner.name });
            delete roomSelections[roomCode]; // Limpiar memoria al final del juego
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