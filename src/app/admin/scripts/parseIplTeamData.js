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
export function parseTeamHtml(htmlString, teamShortName) {
  const players = [];
  
  // Create a temporary div to hold the HTML content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;
  
  // Find all player cards
  const playerCards = tempDiv.querySelectorAll('.ih-pcard1');
  console.log(`Found ${playerCards.length} player cards`);
  
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
    const isForeign = card.querySelector('.teams-foreign-player-icon') !== null;
    
    console.log(`Processing player: ${name}, Role: ${role}, Foreign: ${isForeign}`);
    
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
    console.log(`Starting import for team ${teamShortName}`);
    console.log(`HTML length: ${html.length} characters`);
    
    // Parse HTML
    const players = parseTeamHtml(html, teamShortName);
    console.log(`Parsed ${players.length} players`);
    
    if (players.length === 0) {
      console.error('No players found in the HTML. Check selectors or HTML structure.');
      return {
        success: false,
        teamName: teamShortName,
        error: 'No players found in the HTML. Make sure you copied the correct section.'
      };
    }
    
    // Save to Firebase
    const result = await savePlayersToFirebase(players);
    console.log(`Saved ${result.count} players to Firebase`);
    
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
