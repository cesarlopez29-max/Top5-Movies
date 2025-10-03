// ¡¡¡IMPORTANTE!!! Reemplaza esto con la URL de tu backend en Render
const socket = io('https://top5-movies.onrender.com');

// --- Elementos de la UI ---
const mainMenuScreen = document.getElementById('main-menu-screen');
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const gameChoiceBtns = document.querySelectorAll('.game-choice-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const homeTitle = document.getElementById('home-title');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startGameBtn = document.getElementById('start-game-btn');
const submitSelectionBtn = document.getElementById('submit-selection-btn');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const targetScoreInput = document.getElementById('targetScore');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('players-list');
const roundSection = document.getElementById('round-section');
const resultsSection = document.getElementById('results-section');
const top5moviesRound = document.getElementById('top5movies-round');
const actorNameEl = document.getElementById('actor-name');
const movieSelectorsContainer = document.getElementById('movie-selectors-container');
const top5clubesRound = document.getElementById('top5clubes-round');
const footballerNameEl = document.getElementById('footballer-name');
const clubOptionsContainer = document.getElementById('club-options-container');
const voteStatus = document.getElementById('vote-status');
const resultsContent = document.getElementById('results-content');
const continueBtn = document.getElementById('continue-btn');
const continueStatus = document.getElementById('continue-status');
const podiumScreen = document.getElementById('podium-screen');
const firstPlaceName = document.getElementById('first-place-name');
const firstPlaceScore = document.getElementById('first-place-score');
const secondPlaceName = document.getElementById('second-place-name');
const secondPlaceScore = document.getElementById('second-place-score');
const thirdPlaceName = document.getElementById('third-place-name');
const thirdPlaceScore = document.getElementById('third-place-score');
const playAgainPodiumBtn = document.getElementById('play-again-podium-btn');
const backHomePodiumBtn = document.getElementById('back-home-podium-btn');

let currentRoomCode = '';
let selectedGameType = '';
let myPlayerId = '';
let selectedClubs = new Set();

// --- Navegación y Lógica de Botones ---
gameChoiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        selectedGameType = btn.dataset.gametype;
        mainMenuScreen.classList.add('hidden');
        homeScreen.classList.remove('hidden');
        homeTitle.innerText = (selectedGameType === 'top5movies') ? "🎬 Top 5 Movies" : "⚽ Top 5 Clubes";
    });
});
backToMenuBtn.addEventListener('click', () => {
    homeScreen.classList.add('hidden');
    mainMenuScreen.classList.remove('hidden');
});
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const targetScore = targetScoreInput.value;
    if (playerName && targetScore) {
        socket.emit('createRoom', { playerName, targetScore, gameType: selectedGameType });
    } else { alert('Por favor, introduce tu nombre.'); }
});
joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    const roomCode = roomCodeInput.value;
    if (playerName && roomCode) {
        socket.emit('joinRoom', { roomCode, playerName });
    } else { alert('Por favor, introduce tu nombre y el código de la sala.'); }
});
startGameBtn.addEventListener('click', () => { socket.emit('startGame', { roomCode: currentRoomCode }); });
submitSelectionBtn.addEventListener('click', () => {
    let selection;
    if (selectedGameType === 'top5movies') {
        selection = Array.from(document.querySelectorAll('.movie-selector')).map(select => select.value);
        const uniqueSelection = [...new Set(selection.filter(movie => movie !== 'default'))];
        if (uniqueSelection.length !== 5) return alert("Por favor, elige 5 películas diferentes.");
        selection = uniqueSelection;
    } else if (selectedGameType === 'top5clubes') {
        selection = Array.from(selectedClubs);
        if (selection.length === 0) return alert("Debes elegir al menos un club.");
    }
    socket.emit('submitSelection', { roomCode: currentRoomCode, selection });
    submitSelectionBtn.disabled = true;
    voteStatus.innerText = '¡Selección enviada! Esperando a los demás...';
});
playAgainPodiumBtn.addEventListener('click', () => {
    socket.emit('resetGame', { roomCode: currentRoomCode });
});
backHomePodiumBtn.addEventListener('click', () => {
    window.location.reload();
});
continueBtn.addEventListener('click', () => {
    socket.emit('requestNextRound', { roomCode: currentRoomCode });
    continueBtn.disabled = true;
    continueStatus.innerText = '¡Listo! Esperando a los demás...';
});


// --- Lógica de Renderizado de UI ---
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
            option.value = movie.title;
            option.innerText = movie.title;
            select.appendChild(option);
        });
        movieSelectorsContainer.appendChild(select);
    }
}
function createClubOptions(clubOptions) {
    clubOptionsContainer.innerHTML = '';
    selectedClubs.clear();
    clubOptions.forEach(clubName => {
        const clubDiv = document.createElement('div');
        clubDiv.className = 'club-option';
        clubDiv.innerText = clubName;
        clubDiv.addEventListener('click', () => {
            if (selectedClubs.has(clubName)) {
                selectedClubs.delete(clubName);
                clubDiv.classList.remove('selected');
            } else {
                selectedClubs.add(clubName);
                clubDiv.classList.add('selected');
            }
        });
        clubOptionsContainer.appendChild(clubDiv);
    });
}

// --- Eventos del Servidor ---
socket.on('connect', () => { myPlayerId = socket.id; });
socket.on('connect_error', (err) => { alert(`Error de conexión: ${err.message}.`); });

socket.on('roomCreated', ({ roomCode }) => {
    currentRoomCode = roomCode;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    roomCodeDisplay.innerText = roomCode;
});

socket.on('joinedRoom', ({ roomCode, gameType }) => {
    currentRoomCode = roomCode;
    selectedGameType = gameType;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGameBtn.classList.add('hidden');
    roomCodeDisplay.innerText = roomCode;
});

socket.on('updatePlayers', (players) => {
    playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.innerText = `${player.name} - ${player.score} puntos`;
        playersList.appendChild(li);
    });
});

socket.on('newRound', (data) => {
    // Resetear UI
    startGameBtn.classList.add('hidden');
    resultsSection.classList.add('hidden');
    podiumScreen.classList.add('hidden');
    roundSection.classList.remove('hidden');
    submitSelectionBtn.disabled = false;
    voteStatus.innerText = '';
    continueBtn.disabled = false;
    continueStatus.innerText = '';
    top5moviesRound.classList.add('hidden');
    top5clubesRound.classList.add('hidden');

    selectedGameType = data.gameType;

    if (data.gameType === 'top5movies') {
        actorNameEl.innerText = `Actor: ${data.actorName}`;
        createMovieSelectors(data.movieList);
        top5moviesRound.classList.remove('hidden');
    } else if (data.gameType === 'top5clubes') {
        footballerNameEl.innerText = `Futbolista: ${data.footballerName}`;
        createClubOptions(data.clubOptions);
        top5clubesRound.classList.remove('hidden');
    }
});

socket.on('updateVoteCount', ({ received, total }) => {
    if (received < total) voteStatus.innerText = `Esperando... (${received}/${total} jugadores han votado)`;
});

socket.on('roundResult', (data) => {
    voteStatus.innerText = '';
    roundSection.classList.add('hidden');
    
    // Rellenar el contenido de los resultados dinámicamente
    resultsContent.innerHTML = '';
    if (data.gameType === 'top5movies') {
        resultsContent.innerHTML = `
            <p>Las 5 películas correctas eran:</p>
            <ul id="correct-movies-list" class="poster-list"></ul>
        `;
        const correctMoviesList = document.getElementById('correct-movies-list');
        data.correctMovies.forEach(movie => {
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
    } else if (data.gameType === 'top5clubes') {
        resultsContent.innerHTML = `
            <p>Los clubes correctos eran:</p>
            <ul id="correct-clubs-list"></ul>
        `;
        const correctClubsList = document.getElementById('correct-clubs-list');
        data.correctClubs.forEach(club => {
            const li = document.createElement('li');
            li.innerText = club;
            correctClubsList.appendChild(li);
        });
    }

    playersList.innerHTML = '';
    data.updatedPlayers.forEach(player => {
        const li = document.createElement('li');
        li.innerText = `${player.name} - ${player.score} puntos`;
        playersList.appendChild(li);
    });

    resultsSection.classList.remove('hidden');
    continueStatus.innerText = 'Haz clic en continuar cuando estés listo.';
});

socket.on('updateContinueCount', ({ received, total }) => {
    continueStatus.innerText = `Esperando para la siguiente ronda... (${received}/${total} listos)`;
});

socket.on('gameOver', ({ winnerName, finalScores }) => {
    gameScreen.classList.add('hidden');
    podiumScreen.classList.remove('hidden');
    
    // Rellenar el podio (asegúrate de que los IDs del podio existan en el HTML)
    const sortedPlayers = finalScores.sort((a, b) => b.score - a.score);
    if (sortedPlayers[0]) {
        firstPlaceName.innerText = sortedPlayers[0].name;
        firstPlaceScore.innerText = `${sortedPlayers[0].score} pts`;
    }
    if (sortedPlayers[1]) {
        secondPlaceName.innerText = sortedPlayers[1].name;
        secondPlaceScore.innerText = `${sortedPlayers[1].score} pts`;
    }
    if (sortedPlayers[2]) {
        thirdPlaceName.innerText = sortedPlayers[2].name;
        thirdPlaceScore.innerText = `${sortedPlayers[2].score} pts`;
    }
});

socket.on('error', (message) => { alert(`Error: ${message}`); });