import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ResetHasla from './pages/ResetHasla.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Skladki from './pages/Skladki.jsx';
import SkladkaDetail from './pages/SkladkaDetail.jsx';
import Ucznowie from './pages/Ucznowie.jsx';
import Uzytkownicy from './pages/Uzytkownicy.jsx';
import Backup from './pages/Backup.jsx';
import Ustawienia from './pages/Ustawienia.jsx';
import Logi from './pages/Logi.jsx';
import Statystyki from './pages/Statystyki.jsx';
import Mailing from './pages/Mailing.jsx';
import Zablokowany from './pages/Zablokowany.jsx';
import { DialogProvider } from './components/Dialog.jsx';

function Protected({ children, onlyAdmin = false, onlyKsiegowy = false, onlyKsiegowyOrPelny = false }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (onlyAdmin && user.rola !== 'admin') return <Navigate to="/" replace />;
  if (onlyKsiegowy && !['admin', 'ksiegowy'].includes(user.rola)) return <Navigate to="/" replace />;
  if (onlyKsiegowyOrPelny && !['admin', 'ksiegowy', 'podglad_pelny', 'podglad'].includes(user.rola)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <DialogProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-hasla" element={<ResetHasla />} />
          <Route path="/zablokowany" element={<Zablokowany />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="skladki" element={<Skladki />} />
            <Route path="skladki/:id" element={<SkladkaDetail />} />
            <Route path="ucznowie" element={<Protected onlyKsiegowyOrPelny><Ucznowie /></Protected>} />
            <Route path="uzytkownicy" element={<Protected onlyKsiegowy><Uzytkownicy /></Protected>} />
            <Route path="backup" element={<Protected onlyAdmin><Backup /></Protected>} />
            <Route path="logi" element={<Protected onlyAdmin><Logi /></Protected>} />
            <Route path="statystyki" element={<Protected onlyAdmin><Statystyki /></Protected>} />
            <Route path="mailing" element={<Protected onlyKsiegowy><Mailing /></Protected>} />
            <Route path="ustawienia" element={<Ustawienia />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </DialogProvider>
  );
}
