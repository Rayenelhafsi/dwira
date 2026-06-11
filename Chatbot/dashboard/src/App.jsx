import React from "react";
import { Link, Route, Routes } from "react-router-dom";
import ChatbotLabPage from "./pages/ChatbotLabPage.jsx";
import ConversationsPage from "./pages/ConversationsPage.jsx";
import PendingBookingsPage from "./pages/PendingBookingsPage.jsx";
import LearningPage from "./pages/LearningPage.jsx";

export default function App() {
  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", padding: 16, color: "#173b2f", background: "linear-gradient(180deg, #f4fbf7 0%, #eef5f0 100%)", minHeight: "100vh" }}>
      <h1 style={{ marginTop: 0 }}>AI Booking Assistant Dashboard</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link to="/">Chatbot Lab</Link>
        <Link to="/conversations">Conversations</Link>
        <Link to="/pending">Pending Bookings</Link>
        <Link to="/learning">Learning Feedback</Link>
      </nav>
      <Routes>
        <Route path="/" element={<ChatbotLabPage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/pending" element={<PendingBookingsPage />} />
        <Route path="/learning" element={<LearningPage />} />
      </Routes>
    </div>
  );
}
