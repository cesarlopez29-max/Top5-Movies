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
const movieInputsContainer = document.getElementById('movie-inputs-container');
const voteStatus = document.getElementById('vote-status');
const correctMoviesList = document.getElementById('correct-movies-list');

let currentRoomCode = '';

// --- Eventos de Botones ---
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const targetScore = targetScoreInput.value;
    if (playerName && targetScore) {
        socket.emit('createRoom', { playerName, targetScore });
    }
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const roomCode = roomCodeInput.value;
    if (playerName && roomCode) {
        socket.emit('joinRoom', { roomCode, playerName });
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', { roomCode: currentRoomCode });
    startGameBtn.classList.add('hidden');
});

submitSelectionBtn.addEventListener('click', () => {
    const selection = Array.from(document.querySelectorAll('.movie-input')).map(input => input.value);
    socket.emit('submitSelection', { roomCode: currentRoomCode, selection });
    submitSelectionBtn.disabled = true;
    voteStatus.innerText = '¡Selección enviada! Esperando a los demás...';
});

// --- Lógica de Autocompletado ---
function createMovieInput(index) {
    const container = document.createElement('div');
    container.className = 'autocomplete-container';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'movie-input';
    input.placeholder = `Película ${index + 1}`;
    const suggestions = document.createElement('div');
    suggestions.className = 'autocomplete-suggestions';
    container.appendChild(input);
    container.appendChild(suggestions);

    input.addEventListener('input', async () => {
        const query = input.value;
        if (query.length < 3) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            return;
        }
        // Añadimos la URL completa del backend
        const response = await fetch(`https://top5-movies.onrender.com/search-movies?query=${encodeURIComponent(query)}`);
        const movies = await response.json();
        suggestions.innerHTML = '';
        if (movies && movies.length > 0) {
            suggestions.style.display = 'block';
            movies.forEach(movie => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerText = movie.title;
                item.addEventListener('click', () => {
                    input.value = movie.title;
                    suggestions.innerHTML = '';
                    suggestions.style.display = 'none';
                });
                suggestions.appendChild(item);
            });
        }
    });
    return container;
}

// --- Escuchando Eventos del Servidor ---
socket.on('roomCreated', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.innerText = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGameBtn.classList.remove('hidden'); // Muestra el botón de empezar
});

socket.on('joinedRoom', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.innerText = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGameBtn.classList.add('hidden'); // Oculta el botón para los que se unen
});

socket.on('updatePlayers', (players) => {
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.innerText = `${player.name} - ${player.score} puntos`;
        playersList.appendChild(li);
    });
});

socket.on('newRound', ({ actorName }) => {
    resultsSection.classList.add('hidden');
    actorNameEl.innerText = `Actor: ${actorName}`;
    voteStatus.innerText = '';
    movieInputsContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        movieInputsContainer.appendChild(createMovieInput(i));
    }
    roundSection.classList.remove('hidden');
    submitSelectionBtn.disabled = false;
});

socket.on('updateVoteCount', ({ received, total }) => {
    if (received < total) {
        voteStatus.innerText = `Esperando... (${received}/${total} jugadores han votado)`;
    }
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
        li.innerText = movie;
        correctMoviesList.appendChild(li);
    });
    resultsSection.classList.remove('hidden');
});

socket.on('gameOver', ({ winnerName }) => {
    alert(`¡Juego terminado! El ganador es ${winnerName}`);
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
});