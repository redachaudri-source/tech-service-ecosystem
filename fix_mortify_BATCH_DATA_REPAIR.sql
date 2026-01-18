-- FIX MORTIFY BATCH DATA REPAIR
-- Author: Antigravity
-- Description: Forces a recalculation of all existing Mortify Assessments to ensure consistency with V13 Logic.
-- Specifically targets the "New Appliance" bug where Financial Score was 0 instead of 10.

BEGIN;

-- 1. UPDATE FINANCIAL SCORE FOR ZERO-SPEND APPLIANCES
-- If an appliance has 0 spending in 'finalizado'/'pagado' tickets, its Financial Health is PERFECT (10).
-- This fixes the "14/24" bug (4+0+5+5 -> 4+10+5+5).
UPDATE mortify_assessments ma
SET
    score_financial = 10,
    updated_at = NOW()
WHERE
    appliance_id IN (
        SELECT id
        FROM client_appliances ca
        WHERE (
            SELECT COALESCE(SUM(t.final_price), 0)
            FROM tickets t
            WHERE t.appliance_id = ca.id
            AND t.status IN ('finalizado', 'pagado')
        ) = 0
    );

-- 2. RECALCULATE TOTAL SCORES & VERDICTS (FOR ALL RECORDS)
-- Ensure Total Score is the strict sum of its parts.
-- Update IA Suggestion based on the new total.
UPDATE mortify_assessments
SET
    total_score = score_brand + score_age + score_installation + score_financial,
    ia_suggestion = CASE
        WHEN score_financial = 0 THEN 'OBSOLETE'  -- Ruin Factor
        WHEN (score_brand + score_age + score_installation + score_financial) >= 18 THEN 'VIABLE'
        ELSE 'DOUBTFUL'
    END,
    updated_at = NOW();

-- 3. LOG RESULTS
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM mortify_assessments WHERE total_score >= 18;
    RAISE NOTICE 'Batch Repair Complete. % assessments are now marked as VIABLE (V5/V6).', v_count;
END $$;

COMMIT;
