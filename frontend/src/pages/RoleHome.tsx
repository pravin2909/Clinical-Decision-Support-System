/** The /app index: shows the dashboard for the current user's role. */
import { useAuth } from "../context/AuthProvider";
import DoctorDashboard from "./DoctorDashboard";
import PatientDashboard from "./PatientDashboard";

export default function RoleHome() {
  const { user } = useAuth();
  return user?.role === "doctor" ? <DoctorDashboard /> : <PatientDashboard />;
}
