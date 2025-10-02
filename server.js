const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const GameRoom = require('./models/GameRoom');
const UsedActor = require('./models/UsedActor');
const UsedFootballer = require('./models/UsedFootballer');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] }});

// Variables de estado en memoria
const roomSelections = {};
const nextRoundRequests = {};

// Claves de API del archivo .env
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

// Conexión a la base de datos
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// --- LÓGICA PRINCIPAL DE SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('createRoom', async ({ playerName, targetScore, gameType }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        try {
            const newRoom = new GameRoom({
                roomCode, gameType,
                targetScore: parseInt(targetScore, 10),
                players: [{ id: socket.id, name: playerName, score: 0 }],
                usedActors: [], usedFootballers: [], tiedPlayerIds: []
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
                socket.emit('joinedRoom', { roomCode, gameType: room.gameType });
                io.to(roomCode).emit('updatePlayers', updatedRoom.players);
            } else { socket.emit('error', 'La sala no existe.'); }
        } catch (error) { socket.emit('error', 'Error al unirse a la sala.'); }
    });
    
    socket.on('startGame', async ({ roomCode }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        if (room.gameType === 'top5movies') startMoviesRound(roomCode);
        else if (room.gameType === 'top5clubes') startFootballRound(roomCode);
    });
    
    socket.on('submitSelection', async ({ roomCode, selection }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        if (!roomSelections[roomCode]) roomSelections[roomCode] = {};
        
        let playersInRound = room.players;
        if (room.isSuddenDeath && room.tiedPlayerIds) {
            playersInRound = room.players.filter(p => room.tiedPlayerIds.includes(p.id));
        }
        
        roomSelections[roomCode][socket.id] = selection;
        const selectionsCount = Object.keys(roomSelections[roomCode]).length;
        const totalPlayersInRound = playersInRound.length;

        io.to(roomCode).emit('updateVoteCount', { received: selectionsCount, total: totalPlayersInRound });
        if (selectionsCount === totalPlayersInRound) {
            if (room.gameType === 'top5movies') calculateMoviesResults(roomCode);
            else if (room.gameType === 'top5clubes') calculateFootballResults(roomCode);
        }
    });

    socket.on('requestNextRound', async ({ roomCode }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        if (!nextRoundRequests[roomCode]) nextRoundRequests[roomCode] = new Set();
        nextRoundRequests[roomCode].add(socket.id);
        const requestsCount = nextRoundRequests[roomCode].size;
        const totalPlayers = room.players.length;
        io.to(roomCode).emit('updateContinueCount', { received: requestsCount, total: totalPlayers });
        if (requestsCount === totalPlayers) {
            if (room.gameType === 'top5movies') startMoviesRound(roomCode);
            else if (room.gameType === 'top5clubes') startFootballRound(roomCode);
        }
    });
    
    socket.on('resetGame', async ({ roomCode }) => {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        room.players.forEach(player => player.score = 0);
        room.usedActors = [];
        room.usedFootballers = [];
        room.isSuddenDeath = false;
        room.tiedPlayerIds = [];
        await room.save();
        io.to(roomCode).emit('updatePlayers', room.players);
        if (room.gameType === 'top5movies') startMoviesRound(roomCode);
        else if (room.gameType === 'top5clubes') startFootballRound(roomCode);
    });

    socket.on('disconnect', async () => { console.log(`Jugador desconectado: ${socket.id}`); });
});

// --- LÓGICA PARA 'TOP 5 MOVIES' ---
async function startMoviesRound(roomCode) {
    try {
        if (roomSelections[roomCode]) delete roomSelections[roomCode];
        if (nextRoundRequests[roomCode]) delete nextRoundRequests[roomCode];
        let room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        const usedToday = await UsedActor.find({});
        const usedTodayIds = usedToday.map(a => a.actorId);

        let availableActors = [];
        let attempts = 0;
        while(availableActors.length === 0 && attempts < 5) {
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const peopleResponse = await axios.get(`https://api.themoviedb.org/3/person/popular`, { params: { api_key: TMDB_API_KEY, language: 'es-ES', page: randomPage } });
            availableActors = peopleResponse.data.results.filter(person => !usedTodayIds.includes(person.id) && !room.usedActors.includes(person.id));
            attempts++;
        }

        if (availableActors.length === 0) { io.to(roomCode).emit('error', 'No se encontraron actores nuevos.'); return; }
        
        const randomPerson = availableActors[Math.floor(Math.random() * availableActors.length)];
        
        room.usedActors.push(randomPerson.id);
        const newUsedActor = new UsedActor({ actorId: randomPerson.id });
        await newUsedActor.save().catch(err => {});

        const creditsResponse = await axios.get(`https://api.themoviedb.org/3/person/${randomPerson.id}/movie_credits`, { params: { api_key: TMDB_API_KEY, language: 'es-ES' } });
        
        const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w200';
        const allMovies = creditsResponse.data.cast.filter(m => m.poster_path).map(m => ({ title: m.title, poster: TMDB_IMG_URL + m.poster_path })).filter((m, i, self) => i === self.findIndex(t => t.title === m.title)).sort((a, b) => a.title.localeCompare(b.title));
        const topMovies = creditsResponse.data.cast.filter(m => m.vote_count > 200 && m.poster_path).sort((a, b) => b.vote_average - a.vote_average).slice(0, 5).map(m => ({ title: m.title, poster: TMDB_IMG_URL + m.poster_path }));
        
        if (topMovies.length < 5 || allMovies.length < 5) return startMoviesRound(roomCode);

        room.currentActor = { name: randomPerson.name, topMovies };
        await room.save();
        
        io.to(roomCode).emit('newRound', { gameType: 'top5movies', actorName: randomPerson.name, movieList: allMovies, isSuddenDeath: room.isSuddenDeath, tiedPlayerIds: room.tiedPlayerIds });
    } catch (error) { console.error('Error al iniciar ronda de películas:', error); }
}

async function calculateMoviesResults(roomCode) {
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
        
        io.to(roomCode).emit('roundResult', { gameType: 'top5movies', correctMovies: room.currentActor.topMovies, playerScores: roundScores.map(rs => ({ player: { name: rs.player.name }, hits: rs.hits, selection: rs.selection })), updatedPlayers: room.players });

        const isGameOver = room.players.some(p => p.score >= room.targetScore);
        if (isGameOver) {
            const maxScore = Math.max(...room.players.map(p => p.score));
            const winners = room.players.filter(p => p.score === maxScore);
            if (winners.length > 1) {
                room.isSuddenDeath = true;
                room.tiedPlayerIds = winners.map(p => p.id);
                await room.save();
                io.to(roomCode).emit('suddenDeathTie', { tiedPlayers: winners.map(p => p.name) });
                setTimeout(() => startMoviesRound(roomCode), 5000);
            } else {
                io.to(roomCode).emit('gameOver', { winnerName: winners[0].name, finalScores: room.players.map(p => ({ name: p.name, score: p.score })) });
            }
        }
        await room.save();
    } catch (error) { console.error('Error calculando resultados de películas:', error); }
}

// --- LÓGICA PARA 'TOP 5 CLUBES' ---
async function startFootballRound(roomCode) {
    try {
        if (roomSelections[roomCode]) delete roomSelections[roomCode];
        if (nextRoundRequests[roomCode]) delete nextRoundRequests[roomCode];
        let room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        const usedToday = await UsedFootballer.find({});
        const usedTodayIds = usedToday.map(f => f.footballerId);

        const famousPlayers = [
            "Lionel Messi", "Cristiano Ronaldo", "Neymar", 
            "Kylian Mbappé", "Zlatan Ibrahimovic", "Andres Iniesta",
            "Luka Modric", "Sergio Ramos"
        ];
        
        let availablePlayers = famousPlayers.filter(name => !room.usedFootballers.includes(name) && !usedTodayIds.includes(name));
        
        if (availablePlayers.length === 0) {
            io.to(roomCode).emit('error', '¡Ya han salido todos los futbolistas de la lista! Se reiniciará para esta partida.');
            room.usedFootballers = [];
            await room.save();
            availablePlayers = famousPlayers.filter(name => !usedTodayIds.includes(name));
             if (availablePlayers.length === 0) {
                io.to(roomCode).emit('error', 'Todos los futbolistas han sido usados hoy. ¡Vuelvan mañana!');
                return;
            }
        }
        
        const randomPlayerName = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

        // 1. Buscar al jugador para obtener su ID
        const playerSearchRes = await axios.get(`https://${RAPIDAPI_HOST}/players`, {
            params: { search: randomPlayerName, league: '140', season: '2023' }, // Búsqueda más específica
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
        });
        if (!playerSearchRes.data.response || playerSearchRes.data.response.length === 0) {
            console.error(`No se encontró al jugador ${randomPlayerName} en la API.`);
            return startFootballRound(roomCode); // Reintentar con otro jugador
        }
        const playerData = playerSearchRes.data.response[0].player;

        room.usedFootballers.push(randomPlayerName);
        const newUsedFootballer = new UsedFootballer({ footballerId: playerData.id.toString() });
        await newUsedFootballer.save().catch(e => {});

        // 2. Buscar las transferencias (historial de equipos) del jugador
        const transferRes = await axios.get(`https://${RAPIDAPI_HOST}/transfers`, {
            params: { player: playerData.id },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
        });
        
        let correctClubs = new Set();
        if (transferRes.data.response) {
            transferRes.data.response.forEach(transfer => {
                transfer.teams.in.name && correctClubs.add(transfer.teams.in.name);
                transfer.teams.out.name && correctClubs.add(transfer.teams.out.name);
            });
        }
        correctClubs = [...correctClubs];

        // 3. Obtener clubes de distracción
        const leagueRes = await axios.get(`https://${RAPIDAPI_HOST}/teams`, {
            params: { league: '140', season: '2023' },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
        });
        const wrongClubs = leagueRes.data.response
            .map(item => item.team.name)
            .filter(name => !correctClubs.includes(name));

        let allClubOptions = [...correctClubs];
        while (allClubOptions.length < 10 && wrongClubs.length > 0) {
            const randomIndex = Math.floor(Math.random() * wrongClubs.length);
            allClubOptions.push(wrongClubs.splice(randomIndex, 1)[0]);
        }
        allClubOptions.sort(() => Math.random() - 0.5);

        room.currentFootballer = { name: playerData.name, correctClubs };
        await room.save();
        
        io.to(roomCode).emit('newRound', { gameType: 'top5clubes', footballerName: playerData.name, clubOptions: allClubOptions, isSuddenDeath: room.isSuddenDeath, tiedPlayerIds: room.tiedPlayerIds });

    } catch (error) { 
        console.error("Error en startFootballRound:", error.response ? error.response.data : error.message);
        io.to(roomCode).emit('error', 'No se pudo iniciar la ronda de fútbol. La API puede estar fallando.');
    }
}

async function calculateFootballResults(roomCode) {
    try {
        let room = await GameRoom.findOne({ roomCode });
        if (!room || !roomSelections[roomCode]) return;
        
        const selections = roomSelections[roomCode];
        const correctClubs = room.currentFootballer.correctClubs;

        if (room.isSuddenDeath) {
            let maxHits = -1;
            let winnersOfRound = [];
            room.players.filter(p => room.tiedPlayerIds.includes(p.id)).forEach(player => {
                const playerSelection = selections[player.id] || [];
                const hits = playerSelection.filter(club => correctClubs.includes(club)).length;
                if (hits > maxHits) { maxHits = hits; winnersOfRound = [player]; }
                else if (hits === maxHits) { winnersOfRound.push(player); }
            });
            const winnerNames = winnersOfRound.map(w => w.name).join(' y ');
            io.to(roomCode).emit('gameOver', { winnerName: winnerNames, finalScores: room.players.map(p => ({ name: p.name, score: p.score })) });
            room.isSuddenDeath = false; room.tiedPlayerIds = [];
            await room.save();
            return;
        }
        
        room.players.forEach(player => {
            const playerSelection = selections[player.id] || [];
            const hits = playerSelection.filter(club => correctClubs.includes(club)).length;
            player.score += (hits * 2);
        });

        io.to(roomCode).emit('roundResult', { gameType: 'top5clubes', correctClubs, updatedPlayers: room.players });

        const isGameOver = room.players.some(p => p.score >= room.targetScore);
        if (isGameOver) {
            const maxScore = Math.max(...room.players.map(p => p.score));
            const winners = room.players.filter(p => p.score === maxScore);
            if (winners.length > 1) {
                room.isSuddenDeath = true;
                room.tiedPlayerIds = winners.map(p => p.id);
                await room.save();
                io.to(roomCode).emit('suddenDeathTie', { tiedPlayers: winners.map(p => p.name) });
                setTimeout(() => startFootballRound(roomCode), 5000);
            } else {
                io.to(roomCode).emit('gameOver', { winnerName: winners[0].name, finalScores: room.players.map(p => ({ name: p.name, score: p.score })) });
            }
        }
        await room.save();
    } catch (error) { console.error("Error en calculateFootballResults:", error); }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));