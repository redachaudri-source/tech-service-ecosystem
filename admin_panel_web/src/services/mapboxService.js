/**
 * Mapbox Service
 * 
 * Reusable service for Mapbox API calls including:
 * - Travel time calculation between coordinates
 * - Geocoding (address to coordinates)
 */

import { MAPBOX_TOKEN } from '../config/mapbox';

/**
 * Calculate travel time between two points using Mapbox Directions API
 * 
 * @param {Object} from - Origin coordinates { lng, lat }
 * @param {Object} to - Destination coordinates { lng, lat }
 * @returns {Promise<{ duration: number, distance: number } | null>} 
 *          duration in minutes, distance in km, or null if failed
 */
export const getTravelTime = async (from, to) => {
    if (!from?.lng || !from?.lat || !to?.lng || !to?.lat) {
        console.warn('[MapboxService] Invalid coordinates provided');
        return null;
    }

    try {
        const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;

        const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?` +
            `overview=simplified&` +
            `access_token=${MAPBOX_TOKEN}`
        );

        if (!response.ok) {
            console.error('[MapboxService] API Error:', response.status);
            return null;
        }

        const json = await response.json();

        if (!json.routes || json.routes.length === 0) {
            console.warn('[MapboxService] No routes returned');
            return null;
        }

        const route = json.routes[0];
        return {
            duration: Math.round(route.duration / 60), // Convert seconds to minutes
            distance: parseFloat((route.distance / 1000).toFixed(1)) // Convert meters to km
        };

    } catch (error) {
        console.error('[MapboxService] getTravelTime error:', error);
        return null;
    }
};

/**
 * Geocode a postal code to coordinates (Spain-focused)
 * 
 * @param {string} postalCode - Spanish postal code (5 digits)
 * @returns {Promise<{ lng: number, lat: number } | null>}
 */
export const geocodePostalCode = async (postalCode) => {
    if (!postalCode || postalCode.length < 5) {
        return null;
    }

    try {
        const query = `${postalCode}, Spain`;
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
            `access_token=${MAPBOX_TOKEN}&` +
            `limit=1&` +
            `country=es`
        );

        if (!response.ok) return null;

        const json = await response.json();

        if (!json.features || json.features.length === 0) {
            return null;
        }

        const [lng, lat] = json.features[0].center;
        return { lng, lat };

    } catch (error) {
        console.error('[MapboxService] geocodePostalCode error:', error);
        return null;
    }
};

/**
 * Calculate travel time between two postal codes
 * Combines geocoding + travel time calculation
 * 
 * @param {string} fromPostalCode - Origin postal code
 * @param {string} toPostalCode - Destination postal code
 * @returns {Promise<{ duration: number, distance: number } | null>}
 */
export const getTravelTimeBetweenPostalCodes = async (fromPostalCode, toPostalCode) => {
    if (!fromPostalCode || !toPostalCode) {
        return null;
    }

    // If same postal code, return 0 travel time
    if (fromPostalCode === toPostalCode) {
        return { duration: 0, distance: 0 };
    }

    try {
        const [fromCoords, toCoords] = await Promise.all([
            geocodePostalCode(fromPostalCode),
            geocodePostalCode(toPostalCode)
        ]);

        if (!fromCoords || !toCoords) {
            console.warn('[MapboxService] Could not geocode postal codes:', fromPostalCode, toPostalCode);
            return null;
        }

        return await getTravelTime(fromCoords, toCoords);

    } catch (error) {
        console.error('[MapboxService] getTravelTimeBetweenPostalCodes error:', error);
        return null;
    }
};

export default {
    getTravelTime,
    geocodePostalCode,
    getTravelTimeBetweenPostalCodes
};
