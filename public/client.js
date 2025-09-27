// ¡¡¡IMPORTANTE!!! Reemplaza esto con la URL de tu backend en Render
const socket = io('https://top5-movies.onrender.com');

// --- Elementos de la UI ---
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startGameBtn = document.getElementById('start-game-btn');
const submitSelectionBtn = document.getElementById('submit-selection-btn');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const targetScoreInput = document.getElementById('targetScore');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('players-list');
const actorNameEl = document.getElementById('actor-name');
const roundSection = document.getElementById('round-section');
const resultsSection = document.getElementById('results-section');
const moviePostersContainer = document.getElementById('movie-posters-container');
const voteStatus = document.getElementById('vote-status');
const correctMoviesList = document.getElementById('correct-movies-list');

let currentRoomCode = '';
let selectedMovies = new Set(); // Usamos un Set para guardar los títulos de las películas seleccionadas

// --- Eventos de Botones ---
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const targetScore = targetScoreInput.value;
    if (playerName && targetScore) socket.emit('createRoom', { playerName, targetScore });
    else alert('Por favor, introduce tu nombre.');
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const roomCode = roomCodeInput.value;
    if (playerName && roomCode) socket.emit('joinRoom', { roomCode, playerName });
    else alert('Por favor, introduce tu nombre y el código de la sala.');
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', { roomCode: currentRoomCode });
});

submitSelectionBtn.addEventListener('click', () => {
    if (selectedMovies.size !== 5) {
        alert("Por favor, elige exactamente 5 películas.");
        return;
    }
    socket.emit('submitSelection', { roomCode: currentRoomCode, selection: Array.from(selectedMovies) });
    submitSelectionBtn.disabled = true;
    voteStatus.innerText = '¡Selección enviada! Esperando a los demás...';
});

// --- Lógica para crear la parrilla de carteles interactiva ---
function createMoviePosters(movieList) {
    moviePostersContainer.innerHTML = '';
    selectedMovies.clear(); // Limpiar la selección de la ronda anterior

    movieList.forEach(movie => {
        const posterItem = document.createElement('div');
        posterItem.className = 'poster-item';
        posterItem.dataset.title = movie.title;

        const img = document.createElement('img');
        img.src = movie.poster;
        img.alt = movie.title;
        img.loading = 'lazy'; // Carga perezosa para mejorar el rendimiento

        posterItem.appendChild(img);

        // Lógica de clic para seleccionar/deseleccionar
        posterItem.addEventListener('click', () => {
            if (selectedMovies.has(movie.title)) {
                // Si ya está seleccionada, la deseleccionamos
                selectedMovies.delete(movie.title);
                posterItem.classList.remove('selected');
            } else {
                // Si no está seleccionada, la añadimos (si no hemos llegado a 5)
                if (selectedMovies.size < 5) {
                    selectedMovies.add(movie.title);
                    posterItem.classList.add('selected');
                } else {
                    alert('Solo puedes seleccionar 5 películas. Deselecciona una para elegir otra.');
                }
            }
        });
        moviePostersContainer.appendChild(posterItem);
    });
}

// --- Eventos del Servidor (sin cambios en la lógica, solo para asegurar que esté completo) ---
socket.on('connect_error', (err) => { alert(`Error de conexión: ${err.message}.`); });

socket.on('roomCreated', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.innerText = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

socket.on('joinedRoom', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.innerText = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGameBtn.classList.add('hidden');
});

socket.on('updatePlayers', (players) => {
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.innerText = `${player.name} - ${player.score} puntos`;
        playersList.appendChild(li);
    });
});

socket.on('newRound', ({ actorName, movieList }) => {
    startGameBtn.classList.add('hidden');
    resultsSection.classList.add('hidden');
    actorNameEl.innerText = `Actor: ${actorName}`;
    voteStatus.innerText = '';
    
    createMoviePosters(movieList); // Llamar a la nueva función

    roundSection.classList.remove('hidden');
    submitSelectionBtn.disabled = false;
});

socket.on('updateVoteCount', ({ received, total }) => {
    if (received < total) voteStatus.innerText = `Esperando... (${received}/${total} jugadores han votado)`;
});

socket.on('roundResult', ({ correctMovies, playerScores, updatedPlayers }) => {
    voteStatus.innerText = '';
    roundSection.classList.add('hidden');
    playersList.innerHTML = '';
    updatedPlayers.forEach(player => {
        const li = document.createElement('li');
        li.innerText = `${player.name} - ${player.score} puntos`;
        playersList.appendChild(li);
    });
    correctMoviesList.innerHTML = '';
    correctMovies.forEach(movie => {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = movie.poster;
        img.alt = movie.title;
        const p = document.createElement('p');
        p.innerText = movie.title;
        li.appendChild(img);
        li.appendChild(p);
        correctMoviesList.appendChild(li);
    });
    resultsSection.classList.remove('hidden');
});

socket.on('gameOver', ({ winnerName }) => {
    resultsSection.innerHTML += `
        <div class="game-over-container">
            <h2>🎉 ¡Fin de la partida! 🎉</h2>
            <p>El ganador es: ${winnerName}</p>
            <button id="play-again-btn">Jugar de Nuevo</button>
        </div>
    `;
    document.getElementById('play-again-btn').addEventListener('click', () => {
        socket.emit('resetGame', { roomCode: currentRoomCode });
        document.querySelector('.game-over-container').remove();
        resultsSection.classList.add('hidden');
    });
});

socket.on('error', (message) => { alert(`Error: ${message}`); });