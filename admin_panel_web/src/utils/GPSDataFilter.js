/**
 * GPSDataFilter.js
 * 
 * Phase 3: Smart GPS Filtering & Throttling
 * 
 * Purpose: Clean GPS data before feeding it to the animation engine.
 * Eliminates noise, micro-movements, and erratic jumps to ensure smooth,
 * professional tracking without lag.
 * 
 * Key Features:
 * - Micro-movement filtering (<5m threshold)
 * - Noise spike detection (erratic jumps)
 * - Kalman-like smoothing for jittery GPS
 * - Zero-latency filtering (immediate pass-through for valid data)
 */

import { haversineDistance } from './VehicleAnimationEngine';

/**
 * GPSDataFilter Class
 * Filters and validates GPS data before animation
 */
export class GPSDataFilter {
    constructor(options = {}) {
        // Configuration
        this.minMovementThreshold = options.minMovementThreshold || 5; // meters
        this.maxJumpThreshold = options.maxJumpThreshold || 500; // meters (teleport threshold)
        this.noiseWindowSize = options.noiseWindowSize || 3; // number of readings to analyze
        this.smoothingFactor = options.smoothingFactor || 0.3; // 0-1, lower = more smoothing

        // State
        this.lastValidPosition = null;
        this.lastEmittedPosition = null;
        this.positionHistory = []; // For noise detection
        this.isFirstReading = true;
    }

    /**
     * Filter incoming GPS position
     * @param {Object} newPosition - {lat, lng}
     * @returns {Object|null} Filtered position or null if rejected
     */
    filter(newPosition) {
        // First reading always passes (with smoothing applied)
        if (this.isFirstReading) {
            this.isFirstReading = false;
            this.lastValidPosition = newPosition;
            this.lastEmittedPosition = newPosition;
            this.positionHistory.push(newPosition);
            return newPosition;
        }

        // Calculate distance from last valid position
        const distance = haversineDistance(this.lastValidPosition, newPosition);

        // FILTER 1: Micro-movement rejection (<5m)
        if (distance < this.minMovementThreshold) {
            console.log(`🚫 GPS micro-movement rejected (${distance.toFixed(1)}m < ${this.minMovementThreshold}m)`);
            return null; // Don't animate for tiny movements
        }

        // FILTER 2: Erratic jump detection (>500m)
        if (distance > this.maxJumpThreshold) {
            console.warn(`⚠️ GPS spike detected (${distance.toFixed(0)}m jump) - analyzing...`);

            // Check if this is a consistent jump or a noise spike
            if (this.isNoisyReading(newPosition)) {
                console.warn(`🚫 GPS noise spike rejected (erratic jump)`);
                return null; // Reject noise spike
            } else {
                console.log(`✅ Large jump validated (likely teleport/tunnel exit)`);
                // Valid large jump (e.g., GPS reconnection after tunnel)
                this.resetFilter(newPosition);
                return newPosition;
            }
        }

        // FILTER 3: Smoothing for jittery GPS (Exponential Moving Average)
        const smoothedPosition = this.applySmoothing(newPosition);

        // Update state
        this.lastValidPosition = newPosition;
        this.lastEmittedPosition = smoothedPosition;
        this.addToHistory(newPosition);

        console.log(`✅ GPS accepted: ${distance.toFixed(1)}m movement`);
        return smoothedPosition;
    }

    /**
     * Detect if reading is a noise spike
     * @param {Object} position - {lat, lng}
     * @returns {boolean} True if likely noise
     */
    isNoisyReading(position) {
        // Not enough history to determine
        if (this.positionHistory.length < 2) {
            return false;
        }

        // Check if position is far from recent history average
        const recentPositions = this.positionHistory.slice(-this.noiseWindowSize);
        const avgLat = recentPositions.reduce((sum, p) => sum + p.lat, 0) / recentPositions.length;
        const avgLng = recentPositions.reduce((sum, p) => sum + p.lng, 0) / recentPositions.length;
        const avgPosition = { lat: avgLat, lng: avgLng };

        const distanceFromAverage = haversineDistance(avgPosition, position);

        // If new position is >2x the max jump threshold from average, it's likely noise
        return distanceFromAverage > (this.maxJumpThreshold * 2);
    }

    /**
     * Apply exponential smoothing to reduce GPS jitter
     * @param {Object} newPosition - {lat, lng}
     * @returns {Object} Smoothed position
     */
    applySmoothing(newPosition) {
        if (!this.lastEmittedPosition) {
            return newPosition;
        }

        // Exponential Moving Average (EMA)
        const alpha = this.smoothingFactor;
        const smoothedLat = this.lastEmittedPosition.lat + alpha * (newPosition.lat - this.lastEmittedPosition.lat);
        const smoothedLng = this.lastEmittedPosition.lng + alpha * (newPosition.lng - this.lastEmittedPosition.lng);

        return {
            lat: smoothedLat,
            lng: smoothedLng
        };
    }

    /**
     * Add position to history (for noise detection)
     * @param {Object} position - {lat, lng}
     */
    addToHistory(position) {
        this.positionHistory.push(position);

        // Keep only recent history
        if (this.positionHistory.length > this.noiseWindowSize * 2) {
            this.positionHistory.shift();
        }
    }

    /**
     * Reset filter state (after validated large jump)
     * @param {Object} position - {lat, lng}
     */
    resetFilter(position) {
        this.lastValidPosition = position;
        this.lastEmittedPosition = position;
        this.positionHistory = [position];
    }

    /**
     * Get current filter state
     */
    getState() {
        return {
            lastValidPosition: this.lastValidPosition,
            lastEmittedPosition: this.lastEmittedPosition,
            historySize: this.positionHistory.length
        };
    }
}

/**
 * Throttle function for GPS updates
 * Ensures minimum time between emissions
 */
export class GPSThrottle {
    constructor(minInterval = 1000) { // 1 second default
        this.minInterval = minInterval;
        this.lastEmitTime = 0;
        this.pendingPosition = null;
        this.timeoutId = null;
    }

    /**
     * Throttle GPS position update
     * @param {Object} position - {lat, lng}
     * @param {Function} callback - Function to call with throttled position
     */
    throttle(position, callback) {
        const now = Date.now();
        const timeSinceLastEmit = now - this.lastEmitTime;

        // Clear any pending timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // Immediate emission if enough time has passed
        if (timeSinceLastEmit >= this.minInterval) {
            this.lastEmitTime = now;
            callback(position);
        } else {
            // Store pending position and schedule delayed emission
            this.pendingPosition = position;
            const delay = this.minInterval - timeSinceLastEmit;

            this.timeoutId = setTimeout(() => {
                if (this.pendingPosition) {
                    this.lastEmitTime = Date.now();
                    callback(this.pendingPosition);
                    this.pendingPosition = null;
                }
                this.timeoutId = null;
            }, delay);
        }
    }

    /**
     * Clear throttle state
     */
    clear() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.pendingPosition = null;
    }
}
