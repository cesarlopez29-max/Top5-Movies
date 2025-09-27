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
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w200'; // URL base para los carteles

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
                players: [{ id: socket.id, name: playerName, score: 0 }],
                usedActors: []
            });
            await newRoom.save();
            socket.join(roomCode);
            socket.emit('roomCreated', { roomCode });
            io.to(roomCode).emit('updatePlayers', newRoom.players);
        } catch (error) { socket.emit('error', 'No se pudo crear la sala.'); }
    });

    socket.on('joinRoom', async ({ roomCode, playerName }) => {
        try {
            let room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
            if (room) {
                if (room.players.some(p => p.id === socket.id)) return;
                room.players.push({ id: socket.id, name: playerName, score: 0 });
                const updatedRoom = await room.save();
                socket.join(roomCode);
                socket.emit('joinedRoom', { roomCode });
                io.to(roomCode).emit('updatePlayers', updatedRoom.players);
            } else { socket.emit('error', 'La sala no existe.'); }
        } catch (error) { socket.emit('error', 'Error al unirse a la sala.'); }
    });
    
    socket.on('startGame', ({ roomCode }) => { startNewRound(roomCode); });
    
    socket.on('submitSelection', async ({ roomCode, selection }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        if (!roomSelections[roomCode]) roomSelections[roomCode] = {};
        roomSelections[roomCode][socket.id] = selection;
        const selectionsCount = Object.keys(roomSelections[roomCode]).length;
        const totalPlayers = room.players.length;
        io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: totalPlayers });
        if (selectionsCount === totalPlayers) calculateResults(roomCode);
    });
    
    socket.on('resetGame', async ({ roomCode }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        room.players.forEach(player => player.score = 0);
        room.usedActors = [];
        await room.save();

        io.to(roomCode).emit('updatePlayers', room.players);
        startNewRound(roomCode);
    });

    socket.on('disconnect', async () => { console.log(`Jugador desconectado: ${socket.id}`); });
});

async function startNewRound(roomCode) {
    try {
        if (roomSelections[roomCode]) delete roomSelections[roomCode];
        let room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, {
            params: { api_key: TMDB_API_KEY, language: 'es-ES' }
        });

        let availableActors = peopleResponse.data.results.filter(person => !room.usedActors.includes(person.id));
        
        if (availableActors.length === 0) {
            io.to(roomCode).emit('error', '¡Han salido todos los actores populares! La lista se reiniciará.');
            room.usedActors = [];
            await room.save();
            availableActors = peopleResponse.data.results;
        }
        
        const randomPerson = availableActors[Math.floor(Math.random() * availableActors.length)];
        room.usedActors.push(randomPerson.id);

        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, {
            params: { api_key: TMDB_API_KEY, language: 'es-ES' }
        });
        
        const allMovies = creditsResponse.data.cast
            .filter(movie => movie.poster_path)
            .map(movie => ({ title: movie.title, poster: TMDB_IMG_URL + movie.poster_path }))
            .filter((movie, index, self) => index === self.findIndex((m) => m.title === movie.title))
            .sort((a, b) => a.title.localeCompare(b.title));

        const topMovies = creditsResponse.data.cast
            .filter(movie => movie.vote_count > 200 && movie.poster_path)
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 5)
            .map(movie => ({ title: movie.title, poster: TMDB_IMG_URL + movie.poster_path }));
        
        if (topMovies.length < 5 || allMovies.length < 5) {
            return startNewRound(roomCode);
        }

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io.to(roomCode).emit('newRound', { actorName: randomPerson.name, movieList: allMovies });
    } catch (error) { console.error('Error al iniciar nueva ronda:', error); }
}

async function calculateResults(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room || !roomSelections[roomCode]) return;

        const correctMovieTitles = room.currentActor.topMovies.map(m => m.title);
        const selections = roomSelections[roomCode];
        const roundScores = [];

        room.players.forEach(player => {
            const playerSelection = selections[player.id] || [];
            const hits = playerSelection.filter(title => correctMovieTitles.includes(title)).length;
            
            let pointsThisRound = hits * 2;
            if (hits === 5) pointsThisRound += 5;
            player.score += pointsThisRound;

            roundScores.push({ player, hits, selection: playerSelection });
        });
        
        io.to(roomCode).emit('roundResult', { 
            correctMovies: room.currentActor.topMovies, 
            playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), 
            updatedPlayers: room.players 
        });

        const winner = room.players.find(p => p.score >= room.targetScore);
        if (winner) {
            io.to(roomCode).emit('gameOver', { winnerName: winner.name });
            delete roomSelections[roomCode];
        } else {
            setTimeout(() => startNewRound(roomCode), 10000);
        }
        await room.save();
    } catch (error) { console.error('Error calculando resultados:', error); }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));