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
    gameType: { type: String, required: true },
    players: [playerSchema],
    targetScore: { type: Number, required: true, default: 10 },
    currentActor: { name: String, topMovies: [movieSchema] },
    currentFootballer: { name: String, correctClubs: [String] },
    usedActors: [{ type: Number }],
    usedFootballers: [{ type: String }],
    isSuddenDeath: { type: Boolean, default: false },
    tiedPlayerIds: [{ type: String }]
}, { timestamps: true });

const GameRoom = mongoose.model('GameRoom', gameRoomSchema);
module.exports = GameRoom;