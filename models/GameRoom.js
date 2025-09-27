const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const playerSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    score: { type: Number, default: 0 }
});

const movieSchema = new Schema({
    title: { type: String, required: true },
    poster: { type: String, required: true }
}, { _id: false });

const gameRoomSchema = new Schema({
    roomCode: { type: String, required: true, unique: true, uppercase: true },
    players: [playerSchema],
    targetScore: { type: Number, required: true, default: 10 },
    currentActor: { 
        name: String, 
        topMovies: [movieSchema] // Ahora guarda título y póster
    },
    usedActors: [{ type: Number }] // Guarda los IDs de los actores ya usados
}, { timestamps: true });

const GameRoom = mongoose.model('GameRoom', gameRoomSchema);
module.exports = GameRoom;