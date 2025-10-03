const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

const BATCH_SIZE = 50; // Número de jugadores a procesar en cada tanda

async function fetchPlayersFromLeague(leagueId) {
    try {
        const response = await axios.get(`https://${RAPIDAPI_HOST}/players`, {
            params: { league: leagueId, season: '2023' },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
        });
        return response.data.response.map(item => ({
            id: item.player.id,
            name: item.player.name,
            club: item.statistics[0].team.name
        }));
    } catch (error) {
        console.error(`Error fetching players from league ${leagueId}:`, error.message);
        return [];
    }
}

async function fetchAllClubs() {
    const leagueIds = ['140', '39', '135', '61', '78']; // La Liga, Premier League, Serie A, Ligue 1, Bundesliga
    let allClubs = new Set();
    for (const leagueId of leagueIds) {
        try {
            const response = await axios.get(`https://${RAPIDAPI_HOST}/teams`, {
                params: { league: leagueId, season: '2023' },
                headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
            });
            response.data.response.forEach(item => allClubs.add(item.team.name));
            console.log(`Fetched clubs from league ${leagueId}. Total unique clubs: ${allClubs.size}`);
        } catch (error) {
            console.error(`Error fetching clubs from league ${leagueId}:`, error.message);
        }
    }
    return Array.from(allClubs);
}


async function generateFiles() {
    console.log("Starting data generation...");
    if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) {
        console.error("ERROR: API keys are not defined in your .env file.");
        return;
    }

    // --- Generar lista de clubes ---
    console.log("\nFetching clubs...");
    const clubs = await fetchAllClubs();
    if (clubs.length > 0) {
        fs.writeFileSync(path.join(__dirname, 'data', 'clubs.json'), JSON.stringify(clubs, null, 4));
        console.log(`SUCCESS: clubs.json generated with ${clubs.length} unique clubs.`);
    } else {
        console.error("Could not fetch clubs. Aborting.");
        return;
    }

    // --- Generar lista de futbolistas ---
    console.log("\nFetching footballers (this may take a few minutes)...");
    const leagueIds = ['140', '39', '135', '61', '78']; // 5 grandes ligas
    let footballers = [];
    for (const leagueId of leagueIds) {
        const players = await fetchPlayersFromLeague(leagueId);
        footballers.push(...players);
        console.log(`Fetched ${players.length} players from league ${leagueId}. Total players so far: ${footballers.length}`);
    }
    
    // Formatear para el juego
    const formattedFootballers = footballers
        .filter(p => p.club && p.club !== "_Retired")
        .map(p => ({ name: p.name, lastClub: p.club }));

    if (formattedFootballers.length > 0) {
        fs.writeFileSync(path.join(__dirname, 'data', 'footballers.json'), JSON.stringify(formattedFootballers, null, 4));
        console.log(`SUCCESS: footballers.json generated with ${formattedFootballers.length} players.`);
    } else {
        console.error("Could not fetch any footballers.");
    }

    console.log("\nData generation finished!");
}

generateFiles();