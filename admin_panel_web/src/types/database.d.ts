/**
 * Database Type Definitions for Project Mortify
 */

export interface ApplianceDefault {
    id: string;
    category_name: string;
    average_market_price: number;
    average_lifespan_years: number;
    base_installation_difficulty: number; // 0 or 1
}

export interface MortifyAssessment {
    id: string;
    created_at: string;
    appliance_id: string;

    // Snapshot Inputs
    input_year?: number;
    input_floor_level?: number;

    // Scoring Breakdown
    score_brand: number;
    score_age: number;
    score_installation: number;
    score_financial: number;

    total_score: number;
    ia_suggestion: 'VIABLE' | 'DOUBTFUL' | 'OBSOLETE';

    // Status & Verdict
    status: 'PENDING_JUDGE' | 'COMPLETED';
    admin_verdict?: 'CONFIRMED_VIABLE' | 'CONFIRMED_OBSOLETE' | null;
    admin_note?: string | null;
    admin_decision_date?: string | null;
}
