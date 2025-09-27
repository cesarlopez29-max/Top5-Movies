const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const playerSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    score: { type: Number, default: 0 }
});

const gameRoomSchema = new Schema({
    roomCode: { type: String, required: true, unique: true, uppercase: true },
    players: [playerSchema],
    targetScore: { type: Number, required: true, default: 10 },
    gameState: { type: String, enum: ['waiting', 'in-progress', 'finished'], default: 'waiting' },
    currentActor: { name: String, topMovies: [String] }
}, { timestamps: true });

const GameRoom = mongoose.model('GameRoom', gameRoomSchema);
module.exports = GameRoom;