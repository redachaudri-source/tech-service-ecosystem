/**
 * Viability Engine Logic
 * Determines if an appliance is worth repairing based on age and expert override.
 */
export const getViabilityStatus = (appliance) => {
    if (!appliance) return { status: 'UNKNOWN', label: 'Sin Datos', color: 'gray' };

    // 1. Priority: Expert Override (God Mode)
    if (appliance.expert_override) {
        return {
            status: 'VIABLE',
            label: 'Avalado por Experto',
            color: 'blue', // Blue indicates manual override/trusted
            icon: 'ShieldCheck'
        };
    }

    // 2. Priority: Age / Obsolescence
    const currentYear = new Date().getFullYear();
    const purchaseYear = appliance.purchase_year ? parseInt(appliance.purchase_year) : null;

    if (purchaseYear) {
        const age = currentYear - purchaseYear;
        const MAX_LIFESPAN = 10; // Hardcoded threshold for now

        if (age > MAX_LIFESPAN) {
            return {
                status: 'OBSOLETE',
                label: `Posible Obsolescencia (${age} años)`,
                color: 'red',
                icon: 'AlertTriangle'
            };
        }
    }

    // 3. Default: Viable
    return {
        status: 'OK',
        label: 'Rentable Reparar',
        color: 'green',
        icon: 'CheckCircle'
    };
};
