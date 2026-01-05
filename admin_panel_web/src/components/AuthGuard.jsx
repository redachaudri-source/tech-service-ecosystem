import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthGuard = ({ children }) => {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Cargando...</div>;
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (role !== 'admin') {
        // If logged in but not admin, maybe redirect to a "Unauthorized" page or just Login
        // For now, Login with error is tricky unless we sign them out. 
        // The Login page handles signing out non-admins, so redirecting there is safe usually if we force logout?
        // Actually, AuthContext should ideally handle this, but let's just Navigate to login
        // which might loop if we don't sign out. 
        // Better: Render a "Forbidden" screen.
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Acceso Denegado</h1>
                    <p className="text-slate-600 mb-6 font-bold">Tu cuenta ({user.email}) no tiene permisos de Administrador.</p>
                    <p className="text-slate-500 mb-6 text-sm">Esta aplicación es exclusiva para gestión administrativa.</p>
                    <button
                        onClick={() => window.location.reload()} // Simple way to reset/logout via Context or button
                        className="bg-slate-900 text-white px-6 py-2 rounded-lg"
                    >
                        Volver al Login
                    </button>
                </div>
            </div>
        );
    }

    return children;
};

export default AuthGuard;
