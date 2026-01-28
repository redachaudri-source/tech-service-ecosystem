import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

// Layouts & Pages
import AuthLayout from './layouts/AuthLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import NewService from './pages/dashboard/NewService';
import DashboardLayout from './layouts/DashboardLayout';
import MyAppliances from './pages/MyAppliances';
import Analytics from './pages/Analytics';
import AddressesPage from './pages/AddressesPage';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/auth" element={!session ? <AuthLayout /> : <Navigate to="/dashboard" />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>

        {/* Protected Dashboard Route */}
        <Route element={<DashboardLayout session={session} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new-service" element={<NewService />} />
          <Route path="/appliances" element={<MyAppliances />} />
          <Route path="/addresses" element={<AddressesPage />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>

        {/* Default Redirect */}
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/auth/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
