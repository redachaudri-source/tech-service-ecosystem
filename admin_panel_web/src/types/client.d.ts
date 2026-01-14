/**
 * Type Definitions for Tech Service Ecosystem - Client Module
 * 
 * Note: This project is JS-based, but these types serve as documentation 
 * and reference for the "Backend Architect" phase.
 */

export interface ClientAsset {
    id: string; // UUID
    client_id: string; // UUID -> profiles.id
    type: string; // e.g., "Washing Machine"
    brand: string; // e.g., "Samsung"
    model?: string | null;
    serial_number?: string | null;
    location?: string | null; // e.g., "Kitchen"
    photo_url?: string | null; // Legacy/Main photo

    // New Photo Columns (Phase 7)
    photo_model?: string | null;
    photo_location?: string | null;
    photo_overview?: string | null;

    // Viability Engine Columns (Phase 3.1)
    purchase_year?: number | null;        // Año de compra
    initial_value_estimate?: number | null; // Valor estimado nuevo
    repair_count?: number;                // Conteo de reparaciones previas
    expert_override?: boolean;            // "God Mode" switch
    expert_note?: string | null;          // Notas del experto

    created_at?: string;
    updated_at?: string;
}

// Enum reference for Ticket Status
export type TicketStatus =
    | 'abierto'
    | 'asignado'
    | 'en_proceso'
    | 'presupuesto_pendiente'
    | 'presupuesto_aceptado'
    | 'piezas_pedidas'
    | 'reparado'
    | 'cancelado'
    | 'cerrado';
