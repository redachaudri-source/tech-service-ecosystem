import { useState, useEffect, useRef } from 'react';
import { Clock, Calendar, User, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * AppointmentSelectorModal - Secretaria Virtual PRO (Fase 3.3.10)
 * 
 * Modal NO cerrable que muestra 3 opciones de cita disponibles
 * con un cronómetro de 3 minutos. El cliente debe seleccionar
 * una opción o indicar que ninguna le viene bien.
 * 
 * Props:
 * - isOpen: boolean - Si el modal está visible
 * - slots: Array<{ date, time_start, time_end, technician_id, technician_name }>
 * - ticketId: number - ID del ticket creado
 * - ticketInfo: { appliance, brand, address } - Info del ticket
 * - timeoutMinutes: number - Minutos para elegir (pro_config.timeout_minutes, default 3)
 * - onConfirm: (selectedSlotIndex: number) => void
 * - onSkip: () => void - Usuario elige "Ninguna me viene bien"
 * - onTimeout: () => void - Se acabó el tiempo
 */
const AppointmentSelectorModal = ({
    isOpen,
    slots = [],
    ticketId,
    ticketInfo = {},
    timeoutMinutes = 3,
    onConfirm,
    onSkip,
    onTimeout
}) => {
    const totalSeconds = Math.max(60, timeoutMinutes * 60);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [timeLeft, setTimeLeft] = useState(totalSeconds);
    const [isExpired, setIsExpired] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const timerRef = useRef(null);

    // Start countdown when modal opens (uses pro_config.timeout_minutes)
    useEffect(() => {
        if (isOpen && slots.length > 0) {
            const seconds = Math.max(60, timeoutMinutes * 60);
            setTimeLeft(seconds);
            setIsExpired(false);
            setSelectedIndex(null);

            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        setIsExpired(true);
                        if (onTimeout) onTimeout();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen, slots, timeoutMinutes]);

    if (!isOpen || slots.length === 0) return null;

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return {
            dayName: days[date.getDay()],
            day: date.getDate(),
            month: months[date.getMonth()]
        };
    };

    const handleConfirm = async (e) => {
        // Prevent double clicks and event bubbling
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (selectedIndex === null || isConfirming) {
            console.log('[Modal] handleConfirm blocked:', { selectedIndex, isConfirming });
            return;
        }

        console.log('[Modal] Confirming slot index:', selectedIndex);
        setIsConfirming(true);
        clearInterval(timerRef.current);

        try {
            await onConfirm(selectedIndex);
            console.log('[Modal] Confirmation successful');
        } catch (e) {
            console.error('[Modal] Error confirming:', e);
            setIsConfirming(false);
        }
    };

    const handleSkip = () => {
        clearInterval(timerRef.current);
        if (onSkip) onSkip();
    };

    // Timer color based on time left
    const getTimerColor = () => {
        if (timeLeft > 60) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (timeLeft > 30) return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-red-600 bg-red-50 border-red-200 animate-pulse';
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            <h2 className="font-bold text-lg">Elige tu Cita</h2>
                        </div>
                        {/* Timer */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono font-bold ${getTimerColor()}`}>
                            <Clock className="w-4 h-4" />
                            <span>{formatTime(timeLeft)}</span>
                        </div>
                    </div>

                    {/* Ticket info */}
                    <div className="text-blue-100 text-sm space-y-0.5">
                        <p>🔧 {ticketInfo.appliance || 'Reparación'} {ticketInfo.brand || ''}</p>
                        <p>📍 {ticketInfo.address || 'Tu dirección'}</p>
                        <p className="text-blue-200 text-xs">Ref: #{ticketId}</p>
                    </div>
                </div>

                {/* Timeout Screen */}
                {isExpired ? (
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-amber-600" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-2">
                            ⏰ Se acabó el tiempo
                        </h3>
                        <p className="text-slate-600 text-sm mb-4">
                            No te preocupes, te llamaremos para coordinar una cita que te venga bien.
                        </p>
                        <p className="text-slate-500 text-xs">
                            Referencia: #{ticketId}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Slot Options */}
                        <div className="p-4 space-y-3">
                            {slots.map((slot, index) => {
                                const { dayName, day, month } = formatDate(slot.date);
                                const isSelected = selectedIndex === index;

                                return (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedIndex(index)}
                                        disabled={isConfirming}
                                        className={`w-full p-4 rounded-xl border-2 text-left transition-all
                                            ${isSelected
                                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20'
                                                : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                            }
                                            ${isConfirming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                        `}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                                                        ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                        {index + 1}
                                                    </span>
                                                    <span className="font-bold text-slate-800">
                                                        {dayName} {day} de {month}
                                                    </span>
                                                </div>
                                                <div className="ml-9 flex flex-col gap-1">
                                                    <span className="text-slate-600 text-sm flex items-center gap-2">
                                                        <Clock size={14} />
                                                        {slot.time_start} - {slot.time_end}
                                                    </span>
                                                    <span className="text-slate-500 text-xs flex items-center gap-2">
                                                        <User size={14} />
                                                        Técnico: {slot.technician_name}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Radio indicator */}
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0
                                                ${isSelected
                                                    ? 'border-blue-600 bg-blue-600'
                                                    : 'border-slate-300'
                                                }`}>
                                                {isSelected && <CheckCircle size={16} className="text-white" />}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Actions */}
                        <div className="p-4 pt-0 space-y-3">
                            {/* Confirm Button - DISABLED until selection */}
                            <button
                                onClick={handleConfirm}
                                disabled={selectedIndex === null || isConfirming}
                                className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                                    ${selectedIndex !== null && !isConfirming
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                {isConfirming ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Confirmando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        Confirmar Cita
                                    </>
                                )}
                            </button>

                            {/* Skip Button */}
                            <button
                                onClick={handleSkip}
                                disabled={isConfirming}
                                className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-medium hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-50"
                            >
                                Ninguna me viene bien
                            </button>
                        </div>

                        {/* Helper text */}
                        <div className="px-4 pb-4">
                            <p className="text-center text-xs text-slate-400">
                                Si no eliges, te llamaremos para coordinar
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AppointmentSelectorModal;
