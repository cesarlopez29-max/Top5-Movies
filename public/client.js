// ¡¡¡IMPORTANTE!!! Reemplaza esto con la URL de tu backend en Render
const socket = io('https://top5-movies.onrender.com');
const BACKEND_URL = 'https://top5-movies.onrender.com'; // Haz lo mismo aquí

// --- Elementos de la UI ---
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
// (El resto de las declaraciones de elementos que ya tenías)
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
    } else {
        alert('Por favor, introduce tu nombre.');
    }
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const roomCode = roomCodeInput.value;
    if (playerName && roomCode) {
        socket.emit('joinRoom', { roomCode, playerName });
    } else {
        alert('Por favor, introduce tu nombre y el código de la sala.');
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', { roomCode: currentRoomCode });
});

submitSelectionBtn.addEventListener('click', () => {
    const selection = Array.from(document.querySelectorAll('.movie-input')).map(input => input.value);
    socket.emit('submitSelection', { roomCode: currentRoomCode, selection });
    submitSelectionBtn.disabled = true;
    voteStatus.innerText = '¡Selección enviada! Esperando a los demás...';
});

// --- Lógica de Autocompletado ---
async function fetchMovieSuggestions(query) {
    if (query.length < 3) return [];
    try {
        const response = await fetch(`$https://top5-movies.onrender.com/search-movies?query=${encodeURIComponent(query)}`);
        if (!response.ok) return [];
        const movies = await response.json();
        return movies;
    } catch (error) {
        console.error("Error fetching movie suggestions:", error);
        return [];
    }
}

function createMovieInput(index) {
    const container = document.createElement('div');
    container.className = 'autocomplete-container';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'movie-input';
    input.placeholder = `Película ${index + 1}`;
    const suggestions = document.createElement('div');
    suggestions.className = 'autocomplete-suggestions hidden';
    container.appendChild(input);
    container.appendChild(suggestions);

    input.addEventListener('input', async () => {
        const movies = await fetchMovieSuggestions(input.value);
        suggestions.innerHTML = '';
        if (movies.length > 0) {
            suggestions.classList.remove('hidden');
            movies.forEach(movie => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerText = movie.title;
                item.addEventListener('click', () => {
                    input.value = movie.title;
                    suggestions.classList.add('hidden');
                });
                suggestions.appendChild(item);
            });
        } else {
            suggestions.classList.add('hidden');
        }
    });
    return container;
}


// --- Escuchando Eventos del Servidor ---
socket.on('connect_error', (err) => {
    alert(`Error de conexión con el servidor: ${err.message}. Asegúrate de que el servidor esté funcionando y la URL sea correcta.`);
});

socket.on('roomCreated', ({ roomCode }) => {
    currentRoomCode = roomCode;
    roomCodeDisplay.innerText = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

// (Pega el resto de los listeners de socket.io que ya tenías: 'joinedRoom', 'updatePlayers', 'newRound', 'gameOver', etc.)

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