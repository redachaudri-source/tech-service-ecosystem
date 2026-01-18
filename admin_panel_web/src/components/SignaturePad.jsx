import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check } from 'lucide-react';

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

        // Handle resizing
        const resizeCanvas = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            ctx.scale(ratio, ratio);
        };
        resizeCanvas();
        // window.addEventListener('resize', resizeCanvas); // Optional: might clear signature
    }, []);

    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        setIsDrawing(true);
        setHasSignature(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
    };

    const handleSave = () => {
        if (!hasSignature) return;
        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Firma del Cliente</h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 font-bold text-sm">Cancelar</button>
                </div>

                <div className="p-4 bg-white relative">
                    <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 touch-none">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-64 touch-none cursor-crosshair"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                    </div>
                    <p className="text-center text-xs text-slate-400 mt-2">Firme dentro del cuadro</p>
                </div>

                <div className="p-4 border-t bg-slate-50 flex gap-3">
                    <button
                        onClick={clear}
                        className="flex-1 py-3 text-slate-600 font-bold bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100"
                    >
                        <Eraser size={18} /> Borrar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasSignature}
                        className={`flex-1 py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors ${hasSignature ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200' : 'bg-slate-300 cursor-not-allowed'}`}
                    >
                        <Check size={18} /> Confirmar Firma
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SignaturePad;
