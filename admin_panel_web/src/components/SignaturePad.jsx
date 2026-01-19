import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, X } from 'lucide-react';

const SignaturePad = ({ onSave, onCancel }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';

        // 1. ROBUST RESIZING
        const resizeCanvas = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            // Get the parent width/height effectively
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * ratio;
            canvas.height = rect.height * ratio;
            ctx.scale(ratio, ratio);
        };

        // Initial Resize
        resizeCanvas();

        // 2. PREVENT SCROLLING ON TOUCH
        // We use passive: false to allow preventDefault()
        const preventScroll = (e) => {
            if (e.target === canvas) {
                e.preventDefault();
            }
        };

        // Attach listeners dynamically to support non-passive
        canvas.addEventListener('touchstart', preventScroll, { passive: false });
        canvas.addEventListener('touchmove', preventScroll, { passive: false });
        canvas.addEventListener('touchend', preventScroll, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', preventScroll);
            canvas.removeEventListener('touchmove', preventScroll);
            canvas.removeEventListener('touchend', preventScroll);
        };
    }, []);

    // Helper to get coordinates correctly on both Mobile & Desktop
    const getCoords = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        // e.preventDefault(); // Handled by listener above
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const { x, y } = getCoords(e);

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
        setHasSignature(true);
    };

    const draw = (e) => {
        // e.preventDefault();
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { x, y } = getCoords(e);

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        // Clear considering the scale
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height); // Use logic dims
        setHasSignature(false);

        // Reset path to avoid connecting to old lines
        ctx.beginPath();
    };

    const handleSave = () => {
        if (!hasSignature) return;
        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">

            {/* Header */}
            <div className="w-full max-w-lg flex justify-between items-center text-white mb-4">
                <h3 className="font-bold text-lg">Firmar Documento</h3>
                <button onClick={onCancel} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
                    <X size={20} />
                </button>
            </div>

            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                <div className="relative bg-white touch-none">
                    {/* 3. CSS TOUCH-ACTION: NONE is critical */}
                    <canvas
                        ref={canvasRef}
                        className="w-full h-[60vh] md:h-80 touch-none cursor-crosshair block bg-white"
                        style={{ touchAction: 'none' }}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        // Touch events are handled by the ref listener to support passive: false
                        // But we keep these for React consistency if needed, though native listeners take precedence
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />

                    <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none opacity-50">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Fimar Aquí</p>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={clear}
                        className="flex-1 py-3.5 text-slate-600 font-bold bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 active:scale-95 transition-all"
                    >
                        <Eraser size={18} /> Borrar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasSignature}
                        className={`flex-1 py-3.5 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${hasSignature ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-slate-300 cursor-not-allowed'}`}
                    >
                        <Check size={20} /> Guardar Firma
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignaturePad;
