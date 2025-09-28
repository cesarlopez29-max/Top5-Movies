const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const usedFootballerSchema = new Schema({
    footballerId: {
        type: String,
        required: true,
        unique: true
    },
    dateUsed: {
        type: Date,
        default: Date.now
    }
});

// Borra los documentos automáticamente después de 24 horas (86400 segundos)
usedFootballerSchema.index({ "dateUsed": 1 }, { expireAfterSeconds: 86400 });

const UsedFootballer = mongoose.model('UsedFootballer', usedFootballerSchema);
module.exports = UsedFootballer;