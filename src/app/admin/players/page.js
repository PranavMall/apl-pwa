"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../../../../firebase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import withAuth from '@/app/components/withAuth';
import styles from './players.module.css';

const PlayersDashboard = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const router = useRouter();
  
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async (startAfterDoc = null) => {
    try {
      setLoading(true);
      
      let playersQuery;
      if (startAfterDoc) {
        playersQuery = query(
          collection(db, 'playersMaster'),
          orderBy('name'),
          startAfter(startAfterDoc),
          limit(PAGE_SIZE)
        );
      } else {
        playersQuery = query(
          collection(db, 'playersMaster'),
          orderBy('name'),
          limit(PAGE_SIZE)
        );
      }
      
      const snapshot = await getDocs(playersQuery);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newPlayers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (startAfterDoc) {
        setPlayers(prev => [...prev, ...newPlayers]);
      } else {
        setPlayers(newPlayers);
      }
      
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching players:', err);
      setError('Failed to fetch players. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (lastVisible) {
      fetchPlayers(lastVisible);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleRoleFilterChange = (e) => {
    setRoleFilter(e.target.value);
  };
  
  const handleRowClick = (playerId) => {
    router.push(`/admin/players/${playerId}`);
  };

  const getFilteredPlayers = () => {
    return players.filter(player => {
      const matchesSearch = 
        player.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.team?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.alternateIds?.some(id => id.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesRole = roleFilter === 'all' || player.role === roleFilter;
      
      return matchesSearch && matchesRole;
    });
  };

  const filteredPlayers = getFilteredPlayers();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Player Master Database</h1>
      
      <div className={styles.actionsBar}>
        <div className={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={handleSearchChange}
            className={styles.searchInput}
          />
          
          <select
            value={roleFilter}
            onChange={handleRoleFilterChange}
            className={styles.roleFilter}
          >
            <option value="all">All Roles</option>
            <option value="batsman">Batsmen</option>
            <option value="bowler">Bowlers</option>
            <option value="allrounder">All-rounders</option>
            <option value="wicketkeeper">Wicket-keepers</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        
        <Link href="/admin/players/new" className={styles.addButton}>
          Add New Player
        </Link>
        
        <Link href="/admin/players/map" className={styles.mapButton}>
          Map Players
        </Link>
        
        <Link href="/admin/players/rebuild" className={styles.rebuildButton}>
          Rebuild Stats
        </Link>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrapper}>
        <table className={styles.playersTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Primary ID</th>
              <th>Role</th>
              <th>Team</th>
              <th>Matches</th>
              <th>Runs</th>
              <th>Wickets</th>
              <th>Alt IDs</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length === 0 && !loading ? (
              <tr>
                <td colSpan="9" className={styles.noResults}>
                  {searchTerm || roleFilter !== 'all' 
                    ? 'No players match your search criteria' 
                    : 'No players found in the database'
                  }
                </td>
              </tr>
            ) : (
              filteredPlayers.map(player => (
                <tr 
                  key={player.id} 
                  className={styles.playerRow}
                  onClick={() => handleRowClick(player.id)}
                >
                  <td>{player.name || 'Unknown'}</td>
                  <td>{player.id}</td>
                  <td>{player.role || 'Unknown'}</td>
                  <td>{player.team || '-'}</td>
                  <td>{player.stats?.matches || 0}</td>
                  <td>{player.stats?.runs || 0}</td>
                  <td>{player.stats?.wickets || 0}</td>
                  <td>{player.alternateIds?.length || 0}</td>
                  <td className={styles.actions}>
                    <Link 
                      href={`/admin/players/${player.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className={styles.editButton}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {loading && <div className={styles.loading}>Loading players...</div>}
      
      {hasMore && !loading && (
        <button 
          onClick={handleLoadMore} 
          className={styles.loadMoreButton}
        >
          Load More
        </button>
      )}
    </div>
  );
};

export default withAuth(PlayersDashboard);
