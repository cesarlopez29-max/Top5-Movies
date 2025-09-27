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
const movieSelectorsContainer = document.getElementById('movie-selectors-container');
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
    const selection = Array.from(document.querySelectorAll('.movie-selector')).map(select => select.value);
    const uniqueSelection = [...new Set(selection.filter(movie => movie !== 'default'))];
    
    if (uniqueSelection.length !== 5) {
        alert("Por favor, elige 5 películas diferentes.");
        return;
    }

    socket.emit('submitSelection', { roomCode: currentRoomCode, selection: uniqueSelection });
    submitSelectionBtn.disabled = true;
    voteStatus.innerText = '¡Selección enviada! Esperando a los demás...';
});

// --- Lógica para crear los menús desplegables ---
function createMovieSelectors(movieList) {
    movieSelectorsContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const select = document.createElement('select');
        select.className = 'movie-selector';
        
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.innerText = `-- Elige la película #${i + 1} --`;
        select.appendChild(defaultOption);

        movieList.forEach(movie => {
            const option = document.createElement('option');
            option.value = movie.title; // Usamos el título para la selección
            option.innerText = movie.title;
            select.appendChild(option);
        });
        movieSelectorsContainer.appendChild(select);
    }
}

// --- Escuchando Eventos del Servidor ---
socket.on('connect_error', (err) => {
    alert(`Error de conexión: ${err.message}.`);
});

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
    
    createMovieSelectors(movieList);

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