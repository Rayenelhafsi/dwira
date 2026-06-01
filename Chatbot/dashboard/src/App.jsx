import React from "react";
import { Link, Route, Routes } from "react-router-dom";
import ConversationsPage from "./pages/ConversationsPage.jsx";
import PendingBookingsPage from "./pages/PendingBookingsPage.jsx";
import LearningPage from "./pages/LearningPage.jsx";

export default function App() {
  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", padding: 16 }}>
      <h1>AI Booking Assistant Dashboard</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Link to="/">Conversations</Link>
        <Link to="/pending">Pending Bookings</Link>
        <Link to="/learning">Learning Feedback</Link>
      </nav>
      <Routes>
        <Route path="/" element={<ConversationsPage />} />
        <Route path="/pending" element={<PendingBookingsPage />} />
        <Route path="/learning" element={<LearningPage />} />
      </Routes>
    </div>
  );
}
