/**
 * VehicleAnimationEngine.js
 * 
 * Phase 2: Motor de Interpolación de Movimiento (60 FPS)
 * 
 * Purpose: Transform discrete GPS updates (every 5-10 seconds) into smooth,
 * videogame-like 60 FPS animations with proper easing and bearing rotation.
 * 
 * Key Features:
 * - Haversine-based interpolation for accurate curved paths
 * - Smooth bearing (rotation) interpolation with angle normalization
 * - RequestAnimationFrame loop for 60 FPS rendering
 * - Easing functions (easeOutCubic) for natural acceleration/deceleration
 * - Edge case handling (stopped vehicle, GPS jumps, late updates)
 */

/**
 * Calculate bearing (direction) between two geographic points
 * @param {Object} start - {lat, lng}
 * @param {Object} end - {lat, lng}
 * @returns {number} Bearing in degrees (0-360)
 */
export function calculateBearing(start, end) {
    const startLat = toRadians(start.lat);
    const startLng = toRadians(start.lng);
    const endLat = toRadians(end.lat);
    const endLng = toRadians(end.lng);

    const dLng = endLng - startLng;

    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    const bearing = toDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360; // Normalize to 0-360
}

/**
 * Interpolate between two bearings (handles 0°/360° wraparound)
 * @param {number} start - Start bearing (0-360)
 * @param {number} end - End bearing (0-360)
 * @param {number} progress - Progress (0-1)
 * @returns {number} Interpolated bearing
 */
export function interpolateBearing(start, end, progress) {
    // Normalize angles to 0-360
    start = ((start % 360) + 360) % 360;
    end = ((end % 360) + 360) % 360;

    // Calculate shortest rotation direction
    let diff = end - start;
    if (diff > 180) {
        diff -= 360;
    } else if (diff < -180) {
        diff += 360;
    }

    const result = start + diff * progress;
    return ((result % 360) + 360) % 360;
}

/**
 * Haversine distance between two points (in meters)
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
export function haversineDistance(point1, point2) {
    const R = 6371000; // Earth radius in meters
    const lat1 = toRadians(point1.lat);
    const lat2 = toRadians(point2.lat);
    const dLat = toRadians(point2.lat - point1.lat);
    const dLng = toRadians(point2.lng - point1.lng);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Interpolate position along great circle (Haversine)
 * @param {Object} start - {lat, lng}
 * @param {Object} end - {lat, lng}
 * @param {number} progress - Progress (0-1)
 * @returns {Object} Interpolated {lat, lng}
 */
export function interpolatePosition(start, end, progress) {
    // For very short distances, use linear interpolation (faster)
    const distance = haversineDistance(start, end);
    if (distance < 10) { // Less than 10 meters
        return {
            lat: start.lat + (end.lat - start.lat) * progress,
            lng: start.lng + (end.lng - start.lng) * progress
        };
    }

    // Haversine interpolation for curved paths
    const lat1 = toRadians(start.lat);
    const lng1 = toRadians(start.lng);
    const lat2 = toRadians(end.lat);
    const lng2 = toRadians(end.lng);

    const d = distance / 6371000; // Angular distance

    const a = Math.sin((1 - progress) * d) / Math.sin(d);
    const b = Math.sin(progress * d) / Math.sin(d);

    const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
    const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);

    return {
        lat: toDegrees(lat),
        lng: toDegrees(lng)
    };
}

/**
 * Easing function: Ease Out Cubic (natural deceleration)
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased progress (0-1)
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Easing function: Ease In Out Cubic (smooth acceleration and deceleration)
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased progress (0-1)
 */
export function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Helper functions
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}

/**
 * VehicleAnimationEngine Class
 * Manages smooth 60 FPS animation between GPS updates
 */
export class VehicleAnimationEngine {
    constructor(options = {}) {
        this.duration = options.duration || 2000; // Animation duration (ms)
        this.easingFunction = options.easingFunction || easeInOutCubic;
        this.onUpdate = options.onUpdate || (() => { }); // Callback for position updates
        this.onComplete = options.onComplete || (() => { }); // Callback when animation completes

        // Animation state
        this.isAnimating = false;
        this.animationFrameId = null;
        this.startTime = null;
        this.startPosition = null;
        this.endPosition = null;
        this.startBearing = 0;
        this.endBearing = 0;
        this.currentPosition = null;
        this.currentBearing = 0;
    }

    /**
     * Start animation to new position
     * @param {Object} newPosition - {lat, lng}
     * @param {Object} options - {immediate: boolean}
     */
    animateTo(newPosition, options = {}) {
        // Edge case: If positions are identical, skip animation
        if (this.currentPosition &&
            Math.abs(this.currentPosition.lat - newPosition.lat) < 0.000001 &&
            Math.abs(this.currentPosition.lng - newPosition.lng) < 0.000001) {
            console.log('🚗 Vehicle stopped (no movement detected)');
            return;
        }

        // Edge case: Large GPS jump (>500m) - teleport instead of animate
        if (this.currentPosition) {
            const distance = haversineDistance(this.currentPosition, newPosition);
            if (distance > 500) {
                console.warn('⚠️ Large GPS jump detected, teleporting vehicle');
                this.currentPosition = newPosition;
                this.currentBearing = this.endBearing;
                this.onUpdate({
                    position: newPosition,
                    bearing: this.currentBearing
                });
                return;
            }
        }

        // Cancel previous animation if running
        if (this.isAnimating) {
            this.stop();
        }

        // Set start position (current or new if first time)
        this.startPosition = this.currentPosition || newPosition;
        this.endPosition = newPosition;

        // Calculate bearings
        this.startBearing = this.currentBearing;
        this.endBearing = calculateBearing(this.startPosition, this.endPosition);

        // Immediate mode (for first load)
        if (options.immediate) {
            this.currentPosition = newPosition;
            this.currentBearing = this.endBearing;
            this.onUpdate({
                position: newPosition,
                bearing: this.endBearing
            });
            return;
        }

        // Start animation
        this.isAnimating = true;
        this.startTime = performance.now();
        this.animate();
    }

    /**
     * Animation loop (60 FPS via requestAnimationFrame)
     */
    animate() {
        if (!this.isAnimating) return;

        const currentTime = performance.now();
        const elapsed = currentTime - this.startTime;
        const rawProgress = Math.min(elapsed / this.duration, 1);

        // Apply easing
        const easedProgress = this.easingFunction(rawProgress);

        // Interpolate position
        this.currentPosition = interpolatePosition(
            this.startPosition,
            this.endPosition,
            easedProgress
        );

        // Interpolate bearing
        this.currentBearing = interpolateBearing(
            this.startBearing,
            this.endBearing,
            easedProgress
        );

        // Callback with updated position and bearing
        this.onUpdate({
            position: this.currentPosition,
            bearing: this.currentBearing,
            progress: rawProgress
        });

        // Continue animation or complete
        if (rawProgress < 1) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            this.complete();
        }
    }

    /**
     * Stop animation
     */
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isAnimating = false;
    }

    /**
     * Complete animation
     */
    complete() {
        this.isAnimating = false;
        this.currentPosition = this.endPosition;
        this.currentBearing = this.endBearing;
        this.onComplete({
            position: this.currentPosition,
            bearing: this.currentBearing
        });
    }

    /**
     * Get current state
     */
    getState() {
        return {
            position: this.currentPosition,
            bearing: this.currentBearing,
            isAnimating: this.isAnimating
        };
    }

    /**
     * Destroy engine (cleanup)
     */
    destroy() {
        this.stop();
        this.onUpdate = null;
        this.onComplete = null;
    }
}
