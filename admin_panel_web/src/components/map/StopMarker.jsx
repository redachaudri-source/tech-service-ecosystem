import React from 'react';

/**
 * StopMarker - Custom SVG House Icon for Service Stops
 * 
 * @param {string} status - Service status: 'pendiente', 'en_proceso', 'completado'
 * @param {boolean} isActive - Whether this is the currently active service
 */
const StopMarker = ({ status = 'pendiente', isActive = false }) => {
    // Color logic based on status
    const getColor = () => {
        if (status === 'completado') return '#10b981'; // Green
        if (isActive || status === 'en_proceso') return '#3b82f6'; // Blue
        return '#94a3b8'; // Gray (pending)
    };

    const fillColor = getColor();

    return (
        <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
        >
            <defs>
                {/* Gradient for depth effect */}
                <linearGradient id={`houseGradient-${status}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={fillColor} stopOpacity="1" />
                    <stop offset="100%" stopColor={fillColor} stopOpacity="0.8" />
                </linearGradient>

                {/* Pulse animation for active service */}
                {isActive && (
                    <radialGradient id="pulseGradient">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </radialGradient>
                )}
            </defs>

            {/* Pulse ring for active service */}
            {isActive && (
                <circle cx="18" cy="18" r="16" fill="url(#pulseGradient)">
                    <animate
                        attributeName="r"
                        from="16"
                        to="20"
                        dur="1.5s"
                        repeatCount="indefinite"
                    />
                    <animate
                        attributeName="opacity"
                        from="0.6"
                        to="0"
                        dur="1.5s"
                        repeatCount="indefinite"
                    />
                </circle>
            )}

            {/* House structure */}
            <g transform="translate(6, 8)">
                {/* Roof */}
                <path
                    d="M 12 0 L 24 8 L 24 10 L 0 10 L 0 8 Z"
                    fill={`url(#houseGradient-${status})`}
                    stroke="white"
                    strokeWidth="0.5"
                />

                {/* Main body */}
                <rect
                    x="0"
                    y="10"
                    width="24"
                    height="16"
                    fill={`url(#houseGradient-${status})`}
                    stroke="white"
                    strokeWidth="0.5"
                />

                {/* Door */}
                <rect
                    x="8"
                    y="16"
                    width="8"
                    height="10"
                    fill="white"
                    opacity="0.9"
                    rx="1"
                />

                {/* Door knob */}
                <circle
                    cx="14"
                    cy="21"
                    r="0.8"
                    fill={fillColor}
                />

                {/* Left window */}
                <rect
                    x="2"
                    y="13"
                    width="5"
                    height="5"
                    fill="white"
                    opacity="0.8"
                    rx="0.5"
                />

                {/* Right window */}
                <rect
                    x="17"
                    y="13"
                    width="5"
                    height="5"
                    fill="white"
                    opacity="0.8"
                    rx="0.5"
                />

                {/* Window panes (cross) */}
                <line x1="4.5" y1="13" x2="4.5" y2="18" stroke={fillColor} strokeWidth="0.5" opacity="0.5" />
                <line x1="2" y1="15.5" x2="7" y2="15.5" stroke={fillColor} strokeWidth="0.5" opacity="0.5" />
                <line x1="19.5" y1="13" x2="19.5" y2="18" stroke={fillColor} strokeWidth="0.5" opacity="0.5" />
                <line x1="17" y1="15.5" x2="22" y2="15.5" stroke={fillColor} strokeWidth="0.5" opacity="0.5" />
            </g>

            {/* Status indicator dot (bottom right) */}
            <circle
                cx="28"
                cy="28"
                r="4"
                fill={fillColor}
                stroke="white"
                strokeWidth="1.5"
            />
        </svg>
    );
};

export default StopMarker;
