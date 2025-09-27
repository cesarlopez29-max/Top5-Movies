// ¡¡¡DEJAREMOS ESTA LÍNEA ASÍ POR AHORA!!!
const socket = io('https://top5-movies.onrender.com');

const homeScreen = document.getElementById('home-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const playerNameInput = document.getElementById('playerName');
const startGameBtn = document.getElementById('start-game-btn');

createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    if (playerName) {
        socket.emit('createRoom', { playerName, targetScore: 10 });
    }
});
startGameBtn.addEventListener('click', () => {
    // Envía el mensaje 'startGame' al servidor
    socket.emit('startGame', { roomCode: currentRoomCode });
    startGameBtn.classList.add('hidden'); // Oculta el botón después de usarlo
});
socket.on('roomCreated', ({ roomCode }) => {
    alert(`¡Sala creada! Código: ${roomCode}`);
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
});