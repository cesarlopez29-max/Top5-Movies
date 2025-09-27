// ¡¡¡DEJAREMOS ESTA LÍNEA ASÍ POR AHORA!!!
const socket = io('https://top5-movies.onrender.com');

const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const playerNameInput = document.getElementById('playerName');

createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    if (playerName) {
        socket.emit('createRoom', { playerName, targetScore: 10 });
    }
});

socket.on('roomCreated', ({ roomCode }) => {
    alert(`¡Sala creada! Código: ${roomCode}`);
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
});