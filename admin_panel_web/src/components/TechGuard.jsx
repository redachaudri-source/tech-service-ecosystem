import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const TechGuard = ({ children }) => {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/tech/login" state={{ from: location }} replace />;
    }

    // Allow both 'tech' and 'admin' to see tech view, but primarily for techs
    if (role !== 'tech' && role !== 'admin') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
                <div className="p-6 bg-white rounded-xl shadow-lg max-w-sm w-full text-center">
                    <h2 className="text-xl font-bold text-red-600 mb-2">Acceso Restringido</h2>
                    <p className="text-slate-600 mb-6">Esta área es exclusiva para personal técnico.</p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors w-full"
                    >
                        Volver al Inicio
                    </button>
                </div>
            </div>
        );
    }

    return children;
};

export default TechGuard;
