"use client";

import { useState, useEffect } from "react";
import { auth } from "../../firebase";
import FieldingForm from "./Form";
import withAuth from "@/app/components/withAuth"; // Your existing auth HOC
import styles from './page.module.css';
import { getMatches } from "./api";

const FieldingStatsPage = () => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

 useEffect(() => {
  const fetchMatches = async () => {
    try {
      setLoading(true);
      const matchData = await getMatches();
      setMatches(matchData);
    } catch (error) {
      console.error("Error fetching matches:", error);
      setError("Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  fetchMatches();
}, []);

  const handleSubmitSuccess = () => {
    setSuccess("Fielding stats updated successfully!");
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading) return <div>Loading matches...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container">
      <h1>Fielding Stats Management</h1>
      {success && <div className="success-alert">{success}</div>}
      <FieldingForm matches={matches} onSuccess={handleSubmitSuccess} />
    </div>
  );
};

export default withAuth(FieldingStatsPage); // Protect this page
