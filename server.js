const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const GameRoom = require('./models/GameRoom');
const UsedActor = require('./models/UsedActor'); // Importamos el nuevo modelo

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] }});

const roomSelections = {};
const TMDB_API_KEY = process.env.TMDB_API_KEY;

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
        
        const playersForRound = room.isSuddenDeath 
            ? room.players.filter(p => room.tiedPlayerIds.includes(p.id)) 
            : room.players;

        roomSelections[roomCode][socket.id] = selection;
        const selectionsCount = Object.keys(roomSelections[roomCode]).length;
        const totalPlayersInRound = playersForRound.length;
        
        io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: totalPlayersInRound });

        if (selectionsCount === totalPlayersInRound) {
            calculateResults(roomCode);
        }
    });
    
    socket.on('resetGame', async ({ roomCode }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        room.players.forEach(player => player.score = 0);
        room.usedActors = [];
        room.isSuddenDeath = false;
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
        
        const usedToday = await UsedActor.find({});
        const usedTodayIds = usedToday.map(a => a.actorId);

        let availableActors = [];
        let attempts = 0;
        while (availableActors.length === 0 && attempts < 5) {
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, {
                params: { api_key: TMDB_API_KEY, language: 'es-ES', page: randomPage }
            });
            availableActors = peopleResponse.data.results.filter(person => !usedTodayIds.includes(person.id) && !room.usedActors.includes(person.id));
            attempts++;
        }

        if (availableActors.length === 0) {
            io.to(roomCode).emit('error', 'No se encontraron actores nuevos.');
            return;
        }
        
        const randomPerson = availableActors[Math.floor(Math.random() * availableActors.length)];
        
        room.usedActors.push(randomPerson.id);
        const newUsedActor = new UsedActor({ actorId: randomPerson.id });
        await newUsedActor.save().catch(err => {});

        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, { params: { api_key: TMDB_API_KEY, language: 'es-ES' }});
        const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w200';
        const allMovies = creditsResponse.data.cast.filter(m => m.poster_path).map(m => ({ title: m.title, poster: TMDB_IMG_URL + m.poster_path })).filter((m, i, self) => i === self.findIndex(t => t.title === m.title)).sort((a, b) => a.title.localeCompare(b.title));
        const topMovies = creditsResponse.data.cast.filter(m => m.vote_count > 200 && m.poster_path).sort((a, b) => b.vote_average - a.vote_average).slice(0, 5).map(m => ({ title: m.title, poster: TMDB_IMG_URL + m.poster_path }));
        
        if (topMovies.length < 5 || allMovies.length < 5) return startNewRound(roomCode);

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io.to(roomCode).emit('newRound', { actorName: randomPerson.name, movieList: allMovies, isSuddenDeath: room.isSuddenDeath, tiedPlayerIds: room.tiedPlayerIds });
    } catch (error) { console.error('Error al iniciar nueva ronda:', error); }
}

async function calculateResults(roomCode) {
    try {
        let room = await GameRoom.findOne({ roomCode });
        if (!room || !roomSelections[roomCode]) return;

        const correctMovieTitles = room.currentActor.topMovies.map(m => m.title);
        const selections = roomSelections[roomCode];
        
        if (room.isSuddenDeath) {
            let maxHits = -1;
            let winnersOfRound = [];
            
            room.players.filter(p => room.tiedPlayerIds.includes(p.id)).forEach(player => {
                const playerSelection = selections[player.id] || [];
                const hits = playerSelection.filter(title => correctMovieTitles.includes(title)).length;
                if (hits > maxHits) {
                    maxHits = hits;
                    winnersOfRound = [player];
                } else if (hits === maxHits) {
                    winnersOfRound.push(player);
                }
            });

            const winnerNames = winnersOfRound.map(w => w.name).join(' y ');
            io.to(roomCode).emit('gameOver', { winnerName: winnerNames, finalScores: room.players.map(p => ({ name: p.name, score: p.score })) });
            room.isSuddenDeath = false;
            room.tiedPlayerIds = [];
            await room.save();
            return;
        }
        
        const roundScores = [];
        room.players.forEach(player => {
            const playerSelection = selections[player.id] || [];
            const hits = playerSelection.filter(title => correctMovieTitles.includes(title)).length;
            let pointsThisRound = hits * 2;
            if (hits === 5) pointsThisRound += 5;
            player.score += pointsThisRound;
            roundScores.push({ player, hits, selection: playerSelection });
        });
        
        io.to(roomCode).emit('roundResult', { correctMovies: room.currentActor.topMovies, playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), updatedPlayers: room.players });

        const isGameOver = room.players.some(p => p.score >= room.targetScore);
        if (isGameOver) {
            const maxScore = Math.max(...room.players.map(p => p.score));
            const winners = room.players.filter(p => p.score === maxScore);
            
            if (winners.length > 1) {
                room.isSuddenDeath = true;
                room.tiedPlayerIds = winners.map(p => p.id);
                io.to(roomCode).emit('suddenDeathTie', { tiedPlayers: winners.map(p => p.name) });
                setTimeout(() => startNewRound(roomCode), 5000);
            } else {
                io.to(roomCode).emit('gameOver', { winnerName: winners[0].name, finalScores: room.players.map(p => ({ name: p.name, score: p.score })) });
            }
        } else {
            setTimeout(() => startNewRound(roomCode), 10000);
        }
        
        await room.save();
    } catch (error) { console.error('Error calculando resultados:', error); }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));