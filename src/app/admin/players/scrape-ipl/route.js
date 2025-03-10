// src/app/api/players/scrape-ipl/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';
import cheerio from 'cheerio';
import { db } from '../../../../../firebase';
import { doc, writeBatch } from 'firebase/firestore';

// IPL teams URLs and shortcuts
const teams = [
  { url: 'https://www.iplt20.com/teams/chennai-super-kings', shortName: 'CSK' },
  { url: 'https://www.iplt20.com/teams/delhi-capitals', shortName: 'DC' },
  { url: 'https://www.iplt20.com/teams/gujarat-titans', shortName: 'GT' },
  { url: 'https://www.iplt20.com/teams/kolkata-knight-riders', shortName: 'KKR' },
  { url: 'https://www.iplt20.com/teams/lucknow-super-giants', shortName: 'LSG' },
  { url: 'https://www.iplt20.com/teams/mumbai-indians', shortName: 'MI' },
  { url: 'https://www.iplt20.com/teams/punjab-kings', shortName: 'PBKS' },
  { url: 'https://www.iplt20.com/teams/rajasthan-royals', shortName: 'RR' },
  { url: 'https://www.iplt20.com/teams/royal-challengers-bangalore', shortName: 'RCB' },
  { url: 'https://www.iplt20.com/teams/sunrisers-hyderabad', shortName: 'SRH' }
];

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

// Function to create player ID from name
function createPlayerId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// Function to scrape players from a team page
async function scrapeTeam(team) {
  try {
    const response = await axios.get(team.url);
    const $ = cheerio.load(response.data);
    const teamName = $('.ih-ptd-title').text().trim();
    const players = [];
    
    // For each player card
    $('.ih-pcard').each((index, element) => {
      const name = $(element).find('.ih-pcard-ttl').text().trim();
      const roleText = $(element).find('.ih-pcard-role').text().trim();
      const role = determineRole(roleText);
      
      if (name) {
        players.push({
          id: createPlayerId(name),
          name: name,
          role: role,
          team: team.shortName,
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
      }
    });
    
    console.log(`Scraped ${players.length} players from ${teamName}`);
    return players;
  } catch (error) {
    console.error(`Error scraping ${team.url}:`, error);
    return [];
  }
}

// Main function to scrape all teams and upload to Firestore
async function scrapeAndPopulatePlayerMaster() {
  const allPlayers = [];
  
  // Scrape all teams
  for (const team of teams) {
    const teamPlayers = await scrapeTeam(team);
    allPlayers.push(...teamPlayers);
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`Total players scraped: ${allPlayers.length}`);
  
  // Upload players using batch operations
  const batch = writeBatch(db);
  let batchCount = 0;
  
  for (const player of allPlayers) {
    const playerRef = doc(db, 'playersMaster', player.id);
    batch.set(playerRef, player);
    batchCount++;
    
    // Commit batch every 400 players (Firestore limit is 500, using 400 to be safe)
    if (batchCount >= 400) {
      await batch.commit();
      console.log(`Committed batch of ${batchCount} players`);
      batchCount = 0;
    }
  }
  
  // Commit any remaining players
  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} players`);
  }
  
  return {
    success: true,
    totalPlayers: allPlayers.length,
    message: 'Player master population complete!'
  };
}

export async function GET() {
  try {
    const result = await scrapeAndPopulatePlayerMaster();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('API error scraping IPL players:', error);
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
