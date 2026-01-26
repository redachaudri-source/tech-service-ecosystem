/**
 * Type Definitions for Tech Service Ecosystem - Client Module
 * 
 * Note: This project is JS-based, but these types serve as documentation 
 * and reference for the "Backend Architect" phase.
 */

// ============================================================================
// Address Types (Multi-Address System - Phase 1)
// ============================================================================

export type AddressLabel =
    | 'Vivienda Principal'
    | 'Oficina'
    | 'Segunda Residencia'
    | 'Otro';

export interface ClientAddress {
    id: string; // UUID
    client_id: string; // UUID -> profiles.id
    label: AddressLabel;
    address_line: string;
    floor?: string | null;
    apartment?: string | null;
    postal_code?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    is_primary: boolean;
    created_at?: string;
    updated_at?: string;
}

// ============================================================================
// Client Profile
// ============================================================================

export interface Client {
    id: string; // UUID
    full_name: string;
    email?: string | null;
    phone: string;
    phone_2?: string | null;
    role: 'client';
    notes?: string | null;
    created_via?: string;
    created_at?: string;
    updated_at?: string;

    // Legacy fields (kept for backwards compatibility during migration)
    address?: string | null;
    floor?: string | null;
    apartment?: string | null;
    city?: string | null;
    postal_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;

    // New multi-address relationship
    addresses?: ClientAddress[];
}

// ============================================================================
// Client Assets
// ============================================================================

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

