export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
};

const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
};

export const formatDistance = (dist) => {
    if (dist === null || dist === undefined) return '--';
    if (dist < 1) return `${Math.round(dist * 1000)}m`;
    return `${dist.toFixed(1)}km`;
};

export const estimateTravelTime = (distKm, speedKmH = 30) => {
    if (!distKm) return null;
    const hours = distKm / speedKmH;
    const mins = Math.round(hours * 60);
    return mins;
};
