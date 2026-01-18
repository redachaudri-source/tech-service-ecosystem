-- FIX V9: RELIABLE MORTIFY TRIGGER
-- Objective: Ensure Mortify Assessment runs EVERY TIME a ticket is finalized, updated while finalized, or paid.
-- We purposely allow re-calculation to ensure the latest financial data is used.

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    
    -- Scores
    v_score_brand INT := 1;
    v_score_age INT := 0;
    v_score_financial INT := 1;
    v_total_score INT := 0;
    
    -- Helpers
    v_market_price NUMERIC := 400;
    v_total_spent NUMERIC := 0;
    v_financial_limit NUMERIC;
    v_lifespan INT := 10;
    
    new_admin_note TEXT;
BEGIN
    -- 1. TRIGGER CONDITION: Is the ticket Active/Paid?
    -- We run if it IS finalized/paid (allow updates to re-trigger for now to fix user issue)
    IF NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true THEN
        
        -- 2. GET MASTER DATA
        SELECT brand, purchase_year, type
        INTO v_app_brand, v_app_year, v_app_type
        FROM client_appliances
        WHERE id = NEW.appliance_id;

        -- 3. GET DEFAULTS (Lifespan & Price)
        SELECT average_market_price, average_lifespan_years 
        INTO v_market_price, v_lifespan
        FROM appliance_category_defaults
        WHERE category_name ILIKE v_app_type
        LIMIT 1;
        
        IF v_market_price IS NULL THEN v_market_price := 400; END IF;
        IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

        -- 4. LOGIC (CURRENT/OLD - To be updated in next step)
        -- Still using the binary logic for now, but fixing the TRIGGER execution.
        
        -- Brand Score
        IF v_app_brand IS NOT NULL THEN
             -- Mock simple lookup
             v_score_brand := 1; 
        END IF;

        -- Age Score (Binary)
        IF v_app_year IS NOT NULL THEN
            IF (EXTRACT(YEAR FROM NOW()) - v_app_year) < (v_lifespan / 2) THEN 
                v_score_age := 1; 
            ELSE 
                v_score_age := 0; 
            END IF;
        END IF;

        -- Financial Score (Current Binary)
        SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
        FROM tickets
        WHERE appliance_id = NEW.appliance_id
        AND (status IN ('finalizado', 'pagado') OR is_paid = true);

        v_financial_limit := v_market_price * 0.5;
        
        IF v_total_spent > v_financial_limit THEN
            v_score_financial := 0; 
            new_admin_note := 'Límite excedido (Gasto: ' || v_total_spent || '€ > Límite: ' || v_financial_limit || '€)';
        ELSE
            v_score_financial := 1;
             new_admin_note := 'Financieramente Viable (Gasto: ' || v_total_spent || '€ < Límite: ' || v_financial_limit || '€)';
        END IF;

        v_total_score := v_score_brand + v_score_age + v_score_financial;

        -- 5. INSERT / UPSERT ASSESSMENT
        -- We insert a NEW record to show history in "Histórico de Veredictos"
        INSERT INTO mortify_assessments (
            appliance_id,
            input_year,
            score_financial,
            total_score,
            status,
            admin_note,
            ia_suggestion,
            created_at
        ) VALUES (
            NEW.appliance_id,
            v_app_year,
            v_score_financial,
            v_total_score,
            'PENDING_JUDGE',
            new_admin_note,
            'Recálculo Trigger V9',
            NOW()
        );

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RECREATE TRIGGER
DROP TRIGGER IF EXISTS auto_mortify_on_close ON tickets;
CREATE TRIGGER auto_mortify_on_close
    AFTER UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_mortify_on_close();
