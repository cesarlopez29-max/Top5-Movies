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
    console.log(`Nuevo jugador conectado: ${socket.id}`);

    // --- Lógica para crear salas ---
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
            console.error("Error al crear la sala:", error);
            socket.emit('error', 'No se pudo crear la sala.');
        }
    });

    // --- Lógica para unirse a salas ---
    socket.on('joinRoom', async ({ roomCode, playerName }) => {
        try {
            const room = await GameRoom.findOne({ roomCode });
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

    // --- LÓGICA PARA INICIAR EL JUEGO (ESTA ES LA PARTE CLAVE) ---
    socket.on('startGame', async ({ roomCode }) => {
        console.log(`Iniciando juego en la sala ${roomCode}`); // Para depurar
        // Aquí deberías llamar a la función que inicia la primera ronda.
        // Por ejemplo: startNewRound(roomCode);
        
        // --- Añade aquí la función startNewRound si no la tienes ---
        // Esta función busca un actor y emite el evento 'newRound'
    });

    // --- Lógica para recibir selecciones ---
    socket.on('submitSelection', async ({ roomCode, selection }) => {
        // ... (Tu lógica para manejar las selecciones)
    });

    // --- Lógica para desconexiones ---
    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        // ... (Tu lógica para manejar desconexiones)
    });
});

// --- ASEGÚRATE DE TENER ESTAS FUNCIONES FUERA DEL BLOQUE io.on('connection',...) ---

async function startNewRound(roomCode) {
    try {
        const room = await GameRoom.findOne({ roomCode });
        if (!room) return;
        
        // Lógica para obtener un actor de la API de TMDb
        // ...
        
        // Cuando tengas el actor, guárdalo y notifica a los jugadores
        const actor = { name: "Tom Hanks", topMovies: ["Forrest Gump", "Saving Private Ryan"] }; // Ejemplo
        room.currentActor = actor;
        await room.save();
        
        io.to(roomCode).emit('newRound', { actorName: actor.name });
    } catch (error) {
        console.error("Error al iniciar nueva ronda:", error);
    }
}
  // Aquí iría el resto de la lógica de Socket.IO (joinRoom, startGame, etc.)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));