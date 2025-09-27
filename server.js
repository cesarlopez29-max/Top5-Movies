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
                player.currentSelection = selection;
                room.markModified('players'); // Esencial para que Mongoose guarde cambios en arrays anidados
            }
            await room.save();
            
            const updatedRoom = await GameRoom.findOne({ roomCode });
            const selectionsCount = updatedRoom.players.filter(p => p.currentSelection && p.currentSelection.length > 0).length;
            
            io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: updatedRoom.players.length });

            if (selectionsCount === updatedRoom.players.length) {
                calculateResults(roomCode);
            }
        } catch (error) {
            console.error("Error en submitSelection:", error);
        }
    });

    socket.on('disconnect', async () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        // Aquí se implementaría la lógica para eliminar al jugador de la sala en la DB
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

        const allMovies = [...new Set(creditsResponse.data.cast.map(movie => movie.title))].sort();
        const topMovies = creditsResponse.data.cast
            .filter(movie => movie.vote_count > 200)
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 5)
            .map(movie => movie.title);
        
        if (topMovies.length < 5 || allMovies.length < 5) {
            return startNewRound(roomCode); // Reintenta si el actor no tiene suficientes películas
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
        if (!room) return;

        const correctMovies = room.currentActor.topMovies;
        const roundScores = [];

        room.players.forEach(player => {
            const hits = player.currentSelection.filter(movie => correctMovies.includes(movie)).length;
            roundScores.push({ player, hits, selection: player.currentSelection });
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

        room.players.forEach(p => { p.currentSelection = []; });
        room.markModified('players');

        const winner = room.players.find(p => p.score >= room.targetScore);
        if (winner) {
            io.to(roomCode).emit('gameOver', { winnerName: winner.name });
        } else {
            setTimeout(() => startNewRound(roomCode), 10000); // Espera 10s para la siguiente ronda
        }
        await room.save();
    } catch (error) {
        console.error('Error calculando resultados:', error);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));