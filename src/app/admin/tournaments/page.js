"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/authContext';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import withAuth from '@/app/components/withAuth';
import styles from './admin.module.css';

const AdminTournamentPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [transferWindows, setTransferWindows] = useState([]);
  
  // New tournament form
  const [newTournament, setNewTournament] = useState({
    name: '',
    startDate: '',
    endDate: '',
    registrationDeadline: '',
    status: 'upcoming' // Default to upcoming
  });
  
  // New transfer window form
  const [newWindow, setNewWindow] = useState({
    startDate: '',
    endDate: '',
    weekNumber: '',
    status: 'upcoming'
  });

  useEffect(() => {
    checkAdminAccess();
    fetchTournaments();
  }, [user]);

  // Check if current user has admin access
  const checkAdminAccess = async () => {
    if (!user) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().isAdmin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin access:', error);
      setLoading(false);
    }
  };

  // Fetch all tournaments
  const fetchTournaments = async () => {
    try {
      const tournamentsRef = collection(db, 'tournaments');
      const q = query(tournamentsRef, orderBy('startDate', 'desc'));
      const snapshot = await getDocs(q);
      
      const tournamentsData = [];
      snapshot.forEach(doc => {
        // Convert dates for display
        const data = doc.data();
        const processedData = {
          id: doc.id,
          ...data,
          // Format dates for display (original Timestamp objects are preserved in data)
          displayStartDate: formatDate(data.startDate),
          displayEndDate: formatDate(data.endDate),
          displayRegistrationDeadline: formatDate(data.registrationDeadline)
        };
        
        tournamentsData.push(processedData);
      });
      
      setTournaments(tournamentsData);
      
      // If there are tournaments and none is selected, select the first one
      if (tournamentsData.length > 0 && !selectedTournament) {
        handleSelectTournament(tournamentsData[0]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
      setMessage({ type: 'error', text: 'Error loading tournaments' });
      setLoading(false);
    }
  };

  // Helper function to format dates from Firestore
  const formatDate = (firestoreDate) => {
    if (!firestoreDate) return '';
    
    try {
      // Handle both Firestore Timestamp and regular Date objects
      const date = firestoreDate.toDate ? firestoreDate.toDate() : new Date(firestoreDate);
      
      // Format for datetime-local input
      return date.toISOString().slice(0, 16);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Handle selecting a tournament
  const handleSelectTournament = (tournament) => {
    setSelectedTournament(tournament);
    
    // Extract transfer windows
    const windows = tournament.transferWindows || [];
    
    // Sort windows by week number
    const sortedWindows = [...windows].sort((a, b) => a.weekNumber - b.weekNumber);
    
    // Format dates for display
    const processedWindows = sortedWindows.map(window => ({
      ...window,
      displayStartDate: formatDate(window.startDate),
      displayEndDate: formatDate(window.endDate)
    }));
    
    setTransferWindows(processedWindows);
    
    // Reset new window form with the next week number
    const nextWeekNumber = processedWindows.length > 0 
      ? Math.max(...processedWindows.map(w => w.weekNumber)) + 1 
      : 1;
    
    setNewWindow({
      startDate: '',
      endDate: '',
      weekNumber: nextWeekNumber,
      status: 'upcoming'
    });
  };

  // Handle input change for new tournament
  const handleTournamentChange = (e) => {
    const { name, value } = e.target;
    setNewTournament(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle input change for new transfer window
  const handleWindowChange = (e) => {
    const { name, value } = e.target;
    setNewWindow(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Convert UTC date string to IST (GST is UTC+5:30)
  const convertToIST = (dateString) => {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    
    // No need to adjust timezone as Firestore handles this
    return date;
  };

  // Create new tournament
  const createTournament = async (e) => {
    e.preventDefault();
    
    if (!newTournament.name || !newTournament.startDate || !newTournament.endDate || !newTournament.registrationDeadline) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }
    
    try {
      setLoading(true);
      
      // Convert input dates to GST
      const startDate = convertToGST(newTournament.startDate);
      const endDate = convertToGST(newTournament.endDate);
      const registrationDeadline = convertToGST(newTournament.registrationDeadline);
      
      // Create tournament ID from name (lowercase, spaces to hyphens)
      const tournamentId = newTournament.name.toLowerCase().replace(/\s+/g, '-');
      
      // Create tournament document
      await setDoc(doc(db, 'tournaments', tournamentId), {
        name: newTournament.name,
        startDate,
        endDate,
        registrationDeadline,
        status: newTournament.status,
        transferWindows: [],
        createdAt: new Date()
      });
      
      setMessage({ type: 'success', text: 'Tournament created successfully' });
      
      // Reset form
      setNewTournament({
        name: '',
        startDate: '',
        endDate: '',
        registrationDeadline: '',
        status: 'upcoming'
      });
      
      // Refresh tournaments
      fetchTournaments();
    } catch (error) {
      console.error('Error creating tournament:', error);
      setMessage({ type: 'error', text: `Error creating tournament: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Add new transfer window
  const addTransferWindow = async (e) => {
    e.preventDefault();
    
    if (!selectedTournament) {
      setMessage({ type: 'error', text: 'Please select a tournament first' });
      return;
    }
    
    if (!newWindow.startDate || !newWindow.endDate || !newWindow.weekNumber) {
      setMessage({ type: 'error', text: 'Please fill in all required fields for the transfer window' });
      return;
    }
    
    try {
      setLoading(true);
      
      // Convert input dates to GST
      const startDate = convertToGST(newWindow.startDate);
      const endDate = convertToGST(newWindow.endDate);
      
      // Create new window object
      const window = {
        startDate,
        endDate,
        weekNumber: parseInt(newWindow.weekNumber),
        status: newWindow.status
      };
      
      // Get existing transfer windows
      const tournamentRef = doc(db, 'tournaments', selectedTournament.id);
      const tournamentDoc = await getDoc(tournamentRef);
      const currentWindows = tournamentDoc.data().transferWindows || [];
      
      // Add new window
      const updatedWindows = [...currentWindows, window];
      
      // Update tournament
      await updateDoc(tournamentRef, {
        transferWindows: updatedWindows,
        lastUpdated: new Date()
      });
      
      setMessage({ type: 'success', text: 'Transfer window added successfully' });
      
      // Reset form
      setNewWindow({
        startDate: '',
        endDate: '',
        weekNumber: parseInt(newWindow.weekNumber) + 1,
        status: 'upcoming'
      });
      
      // Refresh selected tournament
      fetchTournaments();
    } catch (error) {
      console.error('Error adding transfer window:', error);
      setMessage({ type: 'error', text: `Error adding transfer window: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Update transfer window status
  const updateWindowStatus = async (windowIndex, newStatus) => {
    if (!selectedTournament) return;
    
    try {
      setLoading(true);
      
      // Get current transfer windows
      const updatedWindows = [...transferWindows];
      
      // Only one window can be active at a time, so if setting to active,
      // set all others to upcoming
      if (newStatus === 'active') {
        updatedWindows.forEach((window, index) => {
          window.status = index === windowIndex ? 'active' : 'upcoming';
        });
      } else {
        updatedWindows[windowIndex].status = newStatus;
      }
      
      // Update in Firebase
      const tournamentRef = doc(db, 'tournaments', selectedTournament.id);
      await updateDoc(tournamentRef, {
        transferWindows: updatedWindows,
        lastUpdated: new Date()
      });
      
      setMessage({ type: 'success', text: 'Transfer window status updated successfully' });
      
      // Refresh data
      fetchTournaments();
    } catch (error) {
      console.error('Error updating window status:', error);
      setMessage({ type: 'error', text: `Error updating status: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Update tournament status
  const updateTournamentStatus = async (newStatus) => {
    if (!selectedTournament) return;
    
    try {
      setLoading(true);
      
      const tournamentRef = doc(db, 'tournaments', selectedTournament.id);
      await updateDoc(tournamentRef, {
        status: newStatus,
        lastUpdated: new Date()
      });
      
      setMessage({ type: 'success', text: 'Tournament status updated successfully' });
      
      // Refresh data
      fetchTournaments();
    } catch (error) {
      console.error('Error updating tournament status:', error);
      setMessage({ type: 'error', text: `Error updating status: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading tournament manager...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Tournament Manager</h1>
      
      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.grid}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Tournaments</h2>
          
          <div className={styles.tournamentList}>
            {tournaments.map(tournament => (
              <div 
                key={tournament.id} 
                className={`${styles.tournamentItem} ${selectedTournament?.id === tournament.id ? styles.selected : ''}`}
                onClick={() => handleSelectTournament(tournament)}
              >
                <h3>{tournament.name}</h3>
                <div className={styles.tournamentDetails}>
                  <p>Status: <span className={styles[tournament.status]}>{tournament.status}</span></p>
                  <p>Dates: {new Date(tournament.startDate.seconds * 1000).toLocaleDateString()} - {new Date(tournament.endDate.seconds * 1000).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className={styles.formContainer}>
            <h3>Create New Tournament</h3>
            <form onSubmit={createTournament}>
              <div className={styles.formGroup}>
                <label htmlFor="name">Tournament Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newTournament.name}
                  onChange={handleTournamentChange}
                  required
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="startDate">Start Date (GST)</label>
                <input
                  type="datetime-local"
                  id="startDate"
                  name="startDate"
                  value={newTournament.startDate}
                  onChange={handleTournamentChange}
                  required
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="endDate">End Date (GST)</label>
                <input
                  type="datetime-local"
                  id="endDate"
                  name="endDate"
                  value={newTournament.endDate}
                  onChange={handleTournamentChange}
                  required
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="registrationDeadline">Registration Deadline (GST)</label>
                <input
                  type="datetime-local"
                  id="registrationDeadline"
                  name="registrationDeadline"
                  value={newTournament.registrationDeadline}
                  onChange={handleTournamentChange}
                  required
                />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={newTournament.status}
                  onChange={handleTournamentChange}
                  required
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              
              <button type="submit" className={styles.button}>
                Create Tournament
              </button>
            </form>
          </div>
        </div>
        
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Transfer Windows Management</h2>
          
          {selectedTournament ? (
            <>
              <div className={styles.tournamentHeader}>
                <h3>{selectedTournament.name}</h3>
                <div className={styles.statusButtons}>
                  <button
                    className={`${styles.statusButton} ${selectedTournament.status === 'upcoming' ? styles.selected : ''}`}
                    onClick={() => updateTournamentStatus('upcoming')}
                  >
                    Upcoming
                  </button>
                  <button
                    className={`${styles.statusButton} ${selectedTournament.status === 'active' ? styles.selected : ''}`}
                    onClick={() => updateTournamentStatus('active')}
                  >
                    Active
                  </button>
                  <button
                    className={`${styles.statusButton} ${selectedTournament.status === 'completed' ? styles.selected : ''}`}
                    onClick={() => updateTournamentStatus('completed')}
                  >
                    Completed
                  </button>
                </div>
              </div>
              
              <div className={styles.windowsList}>
                <h3>Transfer Windows</h3>
                {transferWindows.length > 0 ? (
                  <table className={styles.windowsTable}>
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Start Date (GST)</th>
                        <th>End Date (GST)</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferWindows.map((window, index) => (
                        <tr key={index}>
                          <td>Week {window.weekNumber}</td>
                          <td>{window.startDate.seconds ? new Date(window.startDate.seconds * 1000).toLocaleString() : new Date(window.startDate).toLocaleString()}</td>
                          <td>{window.endDate.seconds ? new Date(window.endDate.seconds * 1000).toLocaleString() : new Date(window.endDate).toLocaleString()}</td>
                          <td>
                            <span className={styles[window.status]}>
                              {window.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className={`${styles.actionButton} ${window.status === 'active' ? styles.selected : ''}`}
                              onClick={() => updateWindowStatus(index, 'active')}
                            >
                              Set Active
                            </button>
                            <button
                              className={`${styles.actionButton} ${window.status === 'upcoming' ? styles.selected : ''}`}
                              onClick={() => updateWindowStatus(index, 'upcoming')}
                            >
                              Set Upcoming
                            </button>
                            <button
                              className={`${styles.actionButton} ${window.status === 'completed' ? styles.selected : ''}`}
                              onClick={() => updateWindowStatus(index, 'completed')}
                            >
                              Set Completed
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.noData}>No transfer windows created yet.</p>
                )}
              </div>
              
              <div className={styles.formContainer}>
                <h3>Add Transfer Window</h3>
                <form onSubmit={addTransferWindow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="weekNumber">Week Number</label>
                    <input
                      type="number"
                      id="weekNumber"
                      name="weekNumber"
                      value={newWindow.weekNumber}
                      onChange={handleWindowChange}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label htmlFor="startDate">Start Date (GST)</label>
                    <input
                      type="datetime-local"
                      id="startDate"
                      name="startDate"
                      value={newWindow.startDate}
                      onChange={handleWindowChange}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label htmlFor="endDate">End Date (GST)</label>
                    <input
                      type="datetime-local"
                      id="endDate"
                      name="endDate"
                      value={newWindow.endDate}
                      onChange={handleWindowChange}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label htmlFor="windowStatus">Status</label>
                    <select
                      id="windowStatus"
                      name="status"
                      value={newWindow.status}
                      onChange={handleWindowChange}
                      required
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  
                  <button type="submit" className={styles.button}>
                    Add Transfer Window
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <p>Select or create a tournament to manage transfer windows</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default withAuth(AdminTournamentPage);
