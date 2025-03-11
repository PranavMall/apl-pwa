// src/app/admin/scripts/parseIplTeamData.js
import { db } from '../../../firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

// Function to create player ID from name
function createPlayerId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// Function to determine player role based on text
function determineRole(roleText) {
  roleText = roleText.toLowerCase();
  if (roleText.includes('wk-') || roleText.includes('keeper')) {
    return 'wicketkeeper';
  } else if (roleText.includes('all') || roleText.includes('rounder')) {
    return 'allrounder';
  } else if (roleText.includes('bowl')) {
    return 'bowler';
  } else {
    return 'batsman';
  }
}

// Function to parse HTML and extract player data
export function parseTeamHtml(html, teamShortName) {
  const players = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Find all player cards
  const playerCards = doc.querySelectorAll('.ih-pcard1');
  
  playerCards.forEach(card => {
    // Get player name
    const nameElement = card.querySelector('.ih-p-name h2');
    if (!nameElement) return;
    
    const name = nameElement.textContent.trim();
    
    // Get player role
    const roleElement = card.querySelector('.ih-p-img span.d-block');
    if (!roleElement) return;
    
    const roleText = roleElement.textContent.trim();
    const role = determineRole(roleText);
    
    // Check if player is foreign
    const isForeign = !!card.querySelector('.teams-foreign-player-icon');
    
    // Create player object
    players.push({
      id: createPlayerId(name),
      name: name,
      role: role,
      team: teamShortName,
      isForeign: isForeign,
      alternateIds: [],
      active: true,
      stats: {
        matches: 0,
        runs: 0,
        wickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        fifties: 0,
        hundreds: 0,
        points: 0,
      },
      lastUpdated: new Date().toISOString()
    });
  });
  
  return players;
}

// Function to save players to Firebase
export async function savePlayersToFirebase(players) {
  try {
    const batch = writeBatch(db);
    let count = 0;
    
    for (const player of players) {
      const playerRef = doc(db, 'playersMaster', player.id);
      batch.set(playerRef, player, { merge: true });
      count++;
    }
    
    await batch.commit();
    return { success: true, count };
  } catch (error) {
    console.error('Error saving players to Firebase:', error);
    throw error;
  }
}

// Function to handle the team import for a specific team
export async function importTeamPlayers(html, teamShortName) {
  try {
    // Parse HTML
    const players = parseTeamHtml(html, teamShortName);
    
    // Save to Firebase
    const result = await savePlayersToFirebase(players);
    
    return {
      success: true,
      teamName: teamShortName,
      playerCount: players.length,
      message: `Successfully imported ${players.length} players from ${teamShortName}`
    };
  } catch (error) {
    console.error(`Error importing ${teamShortName} players:`, error);
    return {
      success: false,
      teamName: teamShortName,
      error: error.message
    };
  }
}
