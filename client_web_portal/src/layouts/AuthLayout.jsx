import { Outlet } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

const AuthLayout = () => {
    return (
        <div className="min-h-screen flex bg-slate-50">
            {/* Left Side - Marketing/Image */}
            <div className="hidden lg:flex lg:w-1/2 bg-blue-600 relative overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-800 opacity-90"></div>
                <div className="absolute inset-0" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1581092921461-eab62e97a783?q=80&w=2070&auto=format&fit=crop')", backgroundSize: 'cover', backgroundPosition: 'center', mixBlendMode: 'overlay' }}></div>

                <div className="relative z-10 text-white p-12 max-w-xl">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 border border-white/20 shadow-xl">
                        <Sparkles size={32} />
                    </div>
                    <h1 className="text-5xl font-bold mb-6 font-display">Tu Hogar, <br />Siempre a Punto.</h1>
                    <p className="text-xl text-blue-100 leading-relaxed font-light">
                        Gestiona tus reparaciones, consulta el estado de tus electrodomésticos y solicita asistencia técnica en segundos.
                    </p>

                    <div className="mt-12 flex gap-4 text-sm font-medium text-blue-200">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div> Asistencia Rápida
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div> Garantía Certificada
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Form Area */}
            <div className="flex-1 flex flex-col justify-center p-8 sm:p-20 lg:p-32 relative">
                <div className="w-full max-w-md mx-auto">
                    <Outlet />
                </div>

                <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Servicio Técnico Oficial. Todos los derechos reservados.
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
