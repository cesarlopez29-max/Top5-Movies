const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const usedActorSchema = new Schema({
    actorId: {
        type: Number,
        required: true,
        unique: true
    },
    dateUsed: {
        type: Date,
        default: Date.now
    }
});

// Este índice borra los documentos automáticamente después de 24 horas (86400 segundos).
usedActorSchema.index({ "dateUsed": 1 }, { expireAfterSeconds: 86400 });

const UsedActor = mongoose.model('UsedActor', usedActorSchema);
module.exports = UsedActor;