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
            let room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
            if (room) {
                // Prevenir duplicados
                const playerExists = room.players.some(p => p.id === socket.id);
                if (playerExists) return;

                // 1. Añadir al jugador y guardar en la base de datos
                room.players.push({ id: socket.id, name: playerName, score: 0 });
                await room.save();

                // 2. Unir al jugador al canal de comunicación de Socket.IO
                socket.join(roomCode);
                
                // 3. Volver a leer la sala para asegurar que tenemos los datos más frescos
                const updatedRoom = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });

                // 4. Notificar al nuevo jugador que se ha unido
                socket.emit('joinedRoom', { roomCode });
                
                // 5. Enviar la lista de jugadores 100% actualizada a TODOS en la sala
                io.to(roomCode).emit('updatePlayers', updatedRoom.players);
            } else {
                socket.emit('error', 'La sala no existe.');
            }
        } catch (error) {
            console.error('Error en joinRoom:', error);
            socket.emit('error', 'Error al unirse a la sala.');
        }
    });

    socket.on('startGame', ({ roomCode }) => {
        startNewRound(roomCode);
    });

    socket.on('submitSelection', async ({ roomCode, selection }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        if (!roomSelections[roomCode]) {
            roomSelections[roomCode] = {};
        }
        roomSelections[roomCode][socket.id] = selection;

        const selectionsCount = Object.keys(roomSelections[roomCode]).length;
        const totalPlayers = room.players.length;

        io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: totalPlayers });

        if (selectionsCount === totalPlayers) {
            calculateResults(roomCode);
        }
    });

    socket.on('disconnect', async () => { console.log(`Jugador desconectado: ${socket.id}`); });
});

async function startNewRound(roomCode) {
    try {
        if (roomSelections[roomCode]) delete roomSelections[roomCode];
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, { params: { api_key: TMDB_API_KEY, language: 'es-ES' } });
        const randomPerson = peopleResponse.data.results[Math.floor(Math.random() * peopleResponse.data.results.length)];
        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, { params: { api_key: TMDB_API_KEY, language: 'es-ES' } });
        const allMovies = [...new Set(creditsResponse.data.cast.map(movie => movie.title))].sort();
        const topMovies = creditsResponse.data.cast.filter(m => m.vote_count > 200).sort((a, b) => b.vote_average - a.vote_average).slice(0, 5).map(m => m.title);
        if (topMovies.length < 5 || allMovies.length < 5) return startNewRound(roomCode);
        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        io.to(roomCode).emit('newRound', { actorName: randomPerson.name, movieList: allMovies });
    } catch (error) { console.error('Error en startNewRound:', error); }
}

async function calculateResults(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room || !roomSelections[roomCode]) return;
        const correctMovies = room.currentActor.topMovies;
        const selections = roomSelections[roomCode];
        const roundScores = [];
        room.players.forEach(player => {
            const playerSelection = selections[player.id] || [];
            const hits = playerSelection.filter(movie => correctMovies.includes(movie)).length;
            let pointsThisRound = hits * 2;
            if (hits === 5) pointsThisRound += 5;
            player.score += pointsThisRound;
            roundScores.push({ player, hits, selection: playerSelection });
        });
        io.to(roomCode).emit('roundResult', { correctMovies, playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), updatedPlayers: room.players });
        const winner = room.players.find(p => p.score >= room.targetScore);
        if (winner) {
            io.to(roomCode).emit('gameOver', { winnerName: winner.name });
            delete roomSelections[roomCode];
        } else {
            setTimeout(() => startNewRound(roomCode), 10000);
        }
        await room.save();
    } catch (error) { console.error('Error en calculateResults:', error); }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));