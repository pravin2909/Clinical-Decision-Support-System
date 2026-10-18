import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import DashboardLayout from "./pages/DashboardLayout";
import AgentChatPage from "./pages/AgentChatPage";
import PrescriptionsPage from "./pages/PrescriptionsPage";
import DoctorsPage from "./pages/DoctorsPage";
import DoctorAppointmentsPage from "./pages/DoctorAppointmentsPage";
import MessagesPage from "./pages/MessagesPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RoleHome from "./pages/RoleHome";
import TrackerPage from "./pages/TrackerPage";
import HistoryPage from "./pages/HistoryPage";
import DoctorPatientsPage from "./pages/DoctorPatientsPage";
import RequireAuth from "./components/RequireAuth";
import RoleRoute from "./components/RoleRoute";
import { AuthProvider } from "./context/AuthProvider";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* The whole app requires login (the gate). */}
          <Route
            path="/app"
            element={
              <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }
          >
            {/* Role-specific home (patient or doctor dashboard). */}
            <Route index element={<RoleHome />} />

            {/* Patient features — one AI chat: the Health Assistant */}
            <Route path="assistant" element={<RoleRoute role="patient"><AgentChatPage /></RoleRoute>} />
            <Route path="doctors" element={<RoleRoute role="patient"><DoctorsPage /></RoleRoute>} />
            <Route path="tracker" element={<RoleRoute role="patient"><TrackerPage /></RoleRoute>} />
            <Route path="prescriptions" element={<RoleRoute role="patient"><PrescriptionsPage /></RoleRoute>} />
            <Route path="history" element={<RoleRoute role="patient"><HistoryPage /></RoleRoute>} />

            {/* Doctor features — one AI chat: the Copilot */}
            <Route path="copilot-ai" element={<RoleRoute role="doctor"><AgentChatPage /></RoleRoute>} />
            <Route path="appointments" element={<RoleRoute role="doctor"><DoctorAppointmentsPage /></RoleRoute>} />
            <Route path="patients" element={<RoleRoute role="doctor"><DoctorPatientsPage /></RoleRoute>} />

            {/* Shared */}
            <Route path="messages" element={<MessagesPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Legacy routes → redirect to the unified chats */}
            <Route path="diagnosis" element={<Navigate to="/app/assistant" replace />} />
            <Route path="chat" element={<Navigate to="/app/assistant" replace />} />
            <Route path="copilot" element={<Navigate to="/app/copilot-ai" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
