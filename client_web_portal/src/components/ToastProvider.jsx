import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Bell } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

// Contador global para IDs únicos
let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const timeoutsRef = useRef({});

    const removeToast = useCallback((id) => {
        // Limpiar timeout si existe
        if (timeoutsRef.current[id]) {
            clearTimeout(timeoutsRef.current[id]);
            delete timeoutsRef.current[id];
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info', sound = false) => {
        const id = ++toastIdCounter; // ID único incremental
        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto remove after 5 seconds con cleanup
        timeoutsRef.current[id] = setTimeout(() => {
            removeToast(id);
        }, 5000);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-[90vw] sm:max-w-sm">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl shadow-lg border transition-all duration-300 w-full
                            ${toast.type === 'success' ? 'bg-white border-green-200 text-slate-800' :
                                toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' :
                                    'bg-blue-50 border-blue-200 text-blue-900'
                            }`}
                        style={{ animation: 'slideInRight 0.3s ease-out' }}
                    >
                        <div className={`mt-0.5 flex-shrink-0 ${toast.type === 'success' ? 'text-green-500' :
                                toast.type === 'error' ? 'text-red-500' :
                                    'text-blue-500'
                            }`}>
                            {toast.type === 'success' && <CheckCircle size={18} />}
                            {toast.type === 'error' && <AlertCircle size={18} />}
                            {toast.type === 'info' && <Bell size={18} />}
                        </div>
                        <div className="flex-1 text-sm font-medium break-words">
                            {toast.message}
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-slate-400 hover:text-slate-600 transition p-1 -m-1 flex-shrink-0"
                            aria-label="Cerrar notificación"
                        >
                            <X size={18} />
                        </button>
                    </div>
                ))}
            </div>
            
            {/* Keyframe animation */}
            <style>{`
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
