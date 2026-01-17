-- FIX V7: "Connect the Cables" - Full Logic Trigger
-- Instead of copying old assessments, we CALCULATE FRESHLY from the master data.
-- This ensures that even if previous history is blank, this new assessment will be correct.

CREATE OR REPLACE FUNCTION trigger_auto_mortify_on_close()
RETURNS TRIGGER AS $$
DECLARE
    -- Appliance Data
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    
    -- Calculated Scores
    v_score_brand INT := 1; -- Default 1
    v_score_age INT := 0;
    v_score_installation INT := 0; -- Default 0 (Hard/Unknown)
    v_score_financial INT := 1; -- Default 1 (Good)
    v_total_score INT := 0;
    
    -- Helpers
    v_market_price NUMERIC := 400; -- Default fallback
    v_total_spent NUMERIC := 0;
    v_financial_limit NUMERIC;
    
    new_admin_note TEXT := 'Evaluación automática tras reparación.';
BEGIN
    -- 1. Check Condition: Ticket Finalized/Paid
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND 
       (OLD.status NOT IN ('finalizado', 'pagado') AND OLD.is_paid = false) THEN
        
        -- 2. FETCH APPLIANCE MASTER DATA (The "Cables")
        SELECT brand, purchase_year, type
        INTO v_app_brand, v_app_year, v_app_type
        FROM client_appliances
        WHERE id = NEW.appliance_id;

        -- 3. CALCULATE BRAND SCORE
        IF v_app_brand IS NOT NULL THEN
            SELECT score_points INTO v_score_brand
            FROM mortify_brand_scores
            WHERE brand_name ILIKE v_app_brand
            LIMIT 1;
            
            IF v_score_brand IS NULL THEN v_score_brand := 1; END IF;
        END IF;

        -- 4. CALCULATE AGE SCORE
        -- Logic: If age < 6 years => 1 point. Else 0.
        IF v_app_year IS NOT NULL THEN
            IF (EXTRACT(YEAR FROM NOW()) - v_app_year) < 6 THEN 
                v_score_age := 1; 
            ELSE 
                v_score_age := 0; 
            END IF;
        END IF;

        -- 5. CALCULATE FINANCIAL SCORE
        -- A. Get Configured Market Price for Type
        SELECT average_market_price INTO v_market_price
        FROM appliance_category_defaults
        WHERE category_name ILIKE v_app_type
        LIMIT 1;
        
        IF v_market_price IS NULL THEN v_market_price := 400; END IF;

        -- B. Sum Total Spent (Including THIS ticket)
        SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
        FROM tickets
        WHERE appliance_id = NEW.appliance_id
        AND (status IN ('finalizado', 'pagado') OR is_paid = true);

        -- C. Check Limit (50%)
        v_financial_limit := v_market_price * 0.5;
        
        IF v_total_spent > v_financial_limit THEN
            v_score_financial := 0; -- Too expensive!
        ELSE
            v_score_financial := 1; -- Still worth it
        END IF;

        -- 6. TOTAL SCORE
        v_total_score := v_score_brand + v_score_age + v_score_installation + v_score_financial;

        -- 7. INSERT NEW ASSESSMENT (Fully Calculated)
        INSERT INTO mortify_assessments (
            appliance_id,
            input_year,
            input_floor_level,
            score_brand,
            score_age,
            score_installation,
            score_financial,
            total_score,
            status,
            admin_note,
            ia_suggestion,
            created_at
        ) VALUES (
            NEW.appliance_id,
            v_app_year,    -- From real appliance data
            NULL,          -- We don't know the floor automatically (default 0 logic applies in service)
            v_score_brand,
            v_score_age,
            v_score_installation,
            v_score_financial,
            v_total_score,
            'PENDING_JUDGE', -- Ready for Admin
            new_admin_note,
            'Re-evaluación Automática (Datos Conectados)',
            NOW()
        );

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
