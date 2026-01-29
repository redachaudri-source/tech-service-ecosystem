--
-- PostgreSQL database dump
--

\restrict Pg1c6ZO1bDFM60RqEWc4orlItQas9OFIcnRYZSywZgZLKKN1b83acaLFJ7CuRSq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: client_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.client_type_enum AS ENUM (
    'particular',
    'professional'
);


ALTER TYPE public.client_type_enum OWNER TO postgres;

--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ticket_status AS ENUM (
    'solicitado',
    'en_camino',
    'en_diagnostico',
    'esperando_aprobacion',
    'en_reparacion',
    'finalizado',
    'pagado',
    'asignado',
    'en_espera',
    'cancelado',
    'presupuesto_aceptado',
    'presupuesto_pendiente',
    'presupuesto_rechazado',
    'presupuesto_revision',
    'pendiente_material',
    'PENDING_PAYMENT'
);


ALTER TYPE public.ticket_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'tech',
    'client'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: am_i_role(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.am_i_role(target_role_text text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = target_role_text::public.user_role 
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; 
END;
$$;


ALTER FUNCTION public.am_i_role(target_role_text text) OWNER TO postgres;

--
-- Name: auto_assign_address_order(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_assign_address_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_order INT;
BEGIN
    -- Obtener siguiente número de orden
    SELECT COALESCE(MAX(address_order), 0) + 1 INTO next_order
    FROM client_addresses
    WHERE client_id = NEW.client_id;
    
    NEW.address_order := next_order;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_assign_address_order() OWNER TO postgres;

--
-- Name: calculate_ticket_end_time(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_ticket_end_time() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.scheduled_at IS NOT NULL THEN
        -- Safely calculate end time based on duration
        NEW.scheduled_end_at := NEW.scheduled_at + (NEW.estimated_duration || ' minutes')::interval;
    ELSE
        NEW.scheduled_end_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.calculate_ticket_end_time() OWNER TO postgres;

--
-- Name: check_tech_overlap(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_tech_overlap() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only check if tech and date are set and status is active
    -- Cast status to text to avoid Enum errors if 'rejected' is not a valid enum member
    IF NEW.technician_id IS NOT NULL AND NEW.scheduled_at IS NOT NULL AND NEW.status::text NOT IN ('cancelado', 'rejected', 'finalizado') THEN
        IF EXISTS (
            SELECT 1 FROM tickets
            WHERE technician_id = NEW.technician_id
            AND id != NEW.id -- exclude self
            AND status::text NOT IN ('cancelado', 'rejected', 'finalizado') -- only active tickets
            AND scheduled_at IS NOT NULL
            -- Check Overlap: (StartA < EndB) and (EndA > StartB)
            AND scheduled_at < (NEW.scheduled_at + (NEW.estimated_duration || ' minutes')::interval)
            AND (scheduled_at + (estimated_duration || ' minutes')::interval) > NEW.scheduled_at
        ) THEN
            RAISE EXCEPTION 'CONFLICTO_AGENDA: El técnico ya tiene un servicio asignado en ese horario.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_tech_overlap() OWNER TO postgres;

--
-- Name: cleanup_expired_conversations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_expired_conversations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM whatsapp_conversations WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_expired_conversations() OWNER TO postgres;

--
-- Name: fn_calculate_mortify_score(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_calculate_mortify_score(p_appliance_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Appliance Data
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    v_housing_type TEXT;
    v_floor_level INT;

    -- Config Data
    v_base_market_price NUMERIC := 700;
    v_lifespan INT := 10;

    -- Scoring Vars
    v_brand_score_db INT := 1;
    v_score_brand INT;
    v_score_age_pts INT;
    v_score_install INT;
    v_score_fin INT;
    v_recovered_points INT := 0; -- New Variable
    v_total_score INT;
    v_max_possible_fin INT := 10; -- Max Financial Score is 10

    -- Financial Calcs
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51;

    -- Result
    v_ia_suggestion TEXT;
BEGIN
    -- 1. GET APPLIANCE & EXISTING RECOVERY DATA
    SELECT ca.brand, ca.purchase_year, ca.type, ca.housing_type, ca.floor_level, COALESCE(ma.admin_recovered_points, 0)
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level, v_recovered_points
    FROM client_appliances ca
    LEFT JOIN mortify_assessments ma ON ma.appliance_id = ca.id
    WHERE ca.id = p_appliance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appliance not found');
    END IF;

    -- 2. GET DEFAULTS & BRAND SCORE
    SELECT average_market_price, average_lifespan_years
    INTO v_base_market_price, v_lifespan
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 700; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF;
    v_score_brand := v_brand_score_db;

    -- 3. CALCULATE AGE SCORE
    v_age := EXTRACT(YEAR FROM NOW()) - COALESCE(v_app_year, EXTRACT(YEAR FROM NOW())::INT);
    IF v_age < 0 THEN v_age := 0; END IF;
    
    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- 4. CALCULATE INSTALLATION SCORE
    v_score_install := 5;
    IF COALESCE(v_housing_type, 'PISO') = 'PISO' THEN
        IF v_floor_level = 1 THEN v_score_install := 4;
        ELSIF v_floor_level = 2 THEN v_score_install := 3;
        ELSIF v_floor_level = 3 THEN v_score_install := 2;
        ELSIF v_floor_level = 4 THEN v_score_install := 1;
        ELSIF v_floor_level >= 5 THEN v_score_install := 0;
        END IF;
    END IF;

    -- 5. CALCULATE FINANCIAL SCORE
    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = p_appliance_id AND status IN ('finalizado', 'pagado');

    IF v_total_spent = 0 THEN
        v_score_fin := 10;
    ELSE
        v_current_value := v_base_market_price * (1.0 - (LEAST(v_age, v_lifespan)::NUMERIC / v_lifespan::NUMERIC));
        IF v_current_value <= 0 THEN v_current_value := 1; END IF;
        
        v_spend_ratio := v_total_spent / v_current_value;
        IF v_spend_ratio > v_limit_ratio THEN
            v_score_fin := 0;
        ELSE
             v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
             IF v_score_fin < 1 THEN v_score_fin := 1; END IF;
        END IF;
    END IF;

    -- 6. APPLY RECOVERY MECHANIC (The Necromancer)
    -- Admin can recover points, but Total Score cannot exceed theoretical max (24) logically, 
    -- OR we treat recovered points as a bonus that offsets financial loss.
    -- Logic: Base Components + Financial + Recovered.
    -- Constraint: Financial + Recovered cannot exceed 10 (System Integrity)? 
    -- USER SAID: "recuperando... puntos perdidos por tema financiero".
    -- So (Financial + Recovered) should probably not exceed 10. Let's clamp it or allow "Overclocking"?
    -- Strict interpretation: "Recover lost points". lost = (10 - v_score_fin).
    -- We won't enforce clamp strictly in SQL to allow Admin flexibility, but UI should guide it.
    
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin + v_recovered_points;

    -- 7. UPDATE VERDICT
    IF v_total_score >= 18 THEN v_ia_suggestion := 'VIABLE';
    ELSIF v_score_fin = 0 AND v_recovered_points = 0 THEN v_ia_suggestion := 'OBSOLETE'; -- Only ruin if no recovery
    ELSE v_ia_suggestion := 'DOUBTFUL';
    END IF;

    -- 8. UPSERT
    INSERT INTO mortify_assessments (
        appliance_id,
        input_year,
        score_brand,
        score_age,
        score_installation,
        score_financial,
        admin_recovered_points, -- Persist this
        total_score,
        ia_suggestion,
        status,
        updated_at
    ) VALUES (
        p_appliance_id,
        v_app_year,
        v_score_brand,
        v_score_age_pts,
        v_score_install,
        v_score_fin,
        v_recovered_points,
        v_total_score,
        v_ia_suggestion,
        'JUDGED', -- Auto-judge if recalculating? Or keep PENDING? 
                  -- If it's an auto-update loop, we might want to keep current status or default to JUDGED if it was already judged.
                  -- For V2, let's say updates keep it relevant.
        NOW()
    )
    ON CONFLICT (appliance_id) DO UPDATE SET
        score_brand = EXCLUDED.score_brand,
        score_age = EXCLUDED.score_age,
        score_installation = EXCLUDED.score_installation,
        score_financial = EXCLUDED.score_financial,
        -- admin_recovered_points = EXCLUDED.admin_recovered_points, -- DO NOT OVERWRITE WITH DEFAULT 0, KEEP EXISTING!
        -- Wait, the SELECT above retrieved the existing value into v_recovered_points.
        -- So putting v_recovered_points in the INSERT values is correct, effectively preserving it.
        admin_recovered_points = v_recovered_points, 
        total_score = EXCLUDED.total_score,
        ia_suggestion = EXCLUDED.ia_suggestion,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'new_total', v_total_score,
        'recovered', v_recovered_points,
        'financial', v_score_fin
    );
END;
$$;


ALTER FUNCTION public.fn_calculate_mortify_score(p_appliance_id uuid) OWNER TO postgres;

--
-- Name: fn_clear_mortify_history(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_clear_mortify_history() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total INTEGER := 0;
    v_rows INTEGER;
BEGIN
    -- 1. Delete ALL Assessments
    DELETE FROM mortify_assessments WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    -- 2. Delete ALL Tickets (Reset Financial History)
    -- Using CASCADE logic implicitly if FKs exist, otherwise straightforward delete
    DELETE FROM tickets WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;

    RETURN v_total;
END;
$$;


ALTER FUNCTION public.fn_clear_mortify_history() OWNER TO postgres;

--
-- Name: fn_get_appliance_financial_limit(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_get_appliance_financial_limit(p_appliance_id uuid) RETURNS TABLE(market_price numeric, prestige_multiplier numeric, current_value numeric, total_spent numeric, ruin_limit numeric, remaining_budget numeric, recommendation text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_type TEXT;
    v_brand TEXT;
    v_purchase_year INT;
    v_input_year INT;
    v_current_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    v_age INT;
    
    v_market_price NUMERIC := 700; -- Default fallback
    v_lifespan INT := 10;
    v_brand_score INT;
    v_multiplier NUMERIC := 1.0;
    
    v_total_spent NUMERIC := 0;
    v_limit_ratio NUMERIC := 0.51; -- 51% limit by default
    v_calc_value NUMERIC := 0;
    v_ruin_limit NUMERIC := 0;
    v_remaining NUMERIC := 0;
BEGIN
    -- 1. Get Appliance Basic Info
    SELECT type, brand, purchase_year
    INTO v_type, v_brand, v_purchase_year
    FROM client_appliances
    WHERE id = p_appliance_id;

    -- 2. Try to get Input Year from assessments if exists (more accurate)
    SELECT input_year
    INTO v_input_year
    FROM mortify_assessments
    WHERE appliance_id = p_appliance_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Calculate Age
    v_age := COALESCE(v_input_year, v_purchase_year);
    IF v_age IS NOT NULL THEN
        v_age := v_current_year - v_age;
    ELSE
        v_age := 5; -- Default avg age if unknown
    END IF;
    IF v_age < 0 THEN v_age := 0; END IF;

    -- 3. Get Market Defaults
    SELECT average_market_price, average_lifespan_years
    INTO v_market_price, v_lifespan
    FROM appliance_category_defaults
    WHERE category_name ILIKE v_type;
    
    -- Fallbacks
    IF v_market_price IS NULL THEN v_market_price := 600; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- 4. Get Brand Score (Hardcoded Fallback for Reliability)
    -- We match common brands to prestige levels directly to avoid missing table errors
    CASE 
        WHEN v_brand ILIKE '%Miele%' OR v_brand ILIKE '%Liebherr%' OR v_brand ILIKE '%Gaggenau%' THEN
            v_brand_score := 4;
            v_multiplier := 2.2;
        WHEN v_brand ILIKE '%Bosch%' OR v_brand ILIKE '%Balay%' OR v_brand ILIKE '%Siemens%' OR v_brand ILIKE '%Samsung%' THEN
            v_brand_score := 3;
            v_multiplier := 1.6;
        WHEN v_brand ILIKE '%Beko%' OR v_brand ILIKE '%Indesit%' OR v_brand ILIKE '%Teka%' THEN
            v_brand_score := 2;
            v_multiplier := 1.25;
        ELSE
            v_brand_score := 1;
            v_multiplier := 1.0;
    END CASE;

    -- 5. Calculate Current Value (The "Miele Formula")
    -- Base * Multiplier * Depreciation
    v_calc_value := (v_market_price * v_multiplier);
    
    -- Linear Depreciation
    IF v_age < v_lifespan THEN
        v_calc_value := v_calc_value * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
    ELSE
        v_calc_value := 50; -- Scrap value
    END IF;

    -- 6. Calculate Total Spent (Finalized/Paid only)
    SELECT COALESCE(SUM(final_price), 0)
    INTO v_total_spent
    FROM tickets
    WHERE appliance_id = p_appliance_id
    AND status IN ('finalizado', 'pagado');

    -- 7. Calculate Limits
    -- Amnesty Logic: Between 3 and 7 years, we allow spending up to 70% of value
    IF v_age >= 3 AND v_age <= 7 THEN
        v_limit_ratio := 0.70;
    ELSE
        v_limit_ratio := 0.51;
    END IF;

    v_ruin_limit := v_calc_value * v_limit_ratio;
    v_remaining := GREATEST(0, v_ruin_limit - v_total_spent);

    -- 8. Return
    RETURN QUERY SELECT 
        v_market_price,
        v_multiplier,
        v_calc_value,
        v_total_spent,
        v_ruin_limit,
        v_remaining,
        CASE 
            WHEN v_remaining <= 0 THEN 'RUINA_TOTAL'
            WHEN v_remaining < 100 THEN 'ALTO_RIESGO'
            ELSE 'VIABLE'
        END;
END;
$$;


ALTER FUNCTION public.fn_get_appliance_financial_limit(p_appliance_id uuid) OWNER TO postgres;

--
-- Name: get_analytics_kpis(date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_analytics_kpis(start_date date DEFAULT (CURRENT_DATE - '30 days'::interval), end_date date DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        -- A. Brand War (Top Brands by Volume)
        'top_brands', (
            SELECT json_agg(t) FROM (
                SELECT b.name, COUNT(*) as count, 
                       ROUND(AVG(ti.total_amount)::numeric, 2) as avg_ticket
                FROM tickets ti
                JOIN brands b ON ti.brand_id = b.id
                WHERE ti.created_at::DATE BETWEEN start_date AND end_date
                GROUP BY b.name
                ORDER BY count DESC
                LIMIT 10
            ) t
        ),
        
        -- B. Heatmap Data (Postal Code + Count)
        'heatmap', (
            SELECT json_agg(t) FROM (
                SELECT p.postal_code, COUNT(*) as count
                FROM tickets ti
                JOIN profiles p ON ti.client_id = p.id
                WHERE ti.created_at::DATE BETWEEN start_date AND end_date
                AND p.postal_code IS NOT NULL
                GROUP BY p.postal_code
            ) t
        ),

        -- C. Time Rhythm (Day of Week)
        'daily_rhythm', (
            SELECT json_agg(t) FROM (
                SELECT TO_CHAR(created_at, 'Day') as day_name, COUNT(*) as count
                FROM tickets 
                WHERE created_at::DATE BETWEEN start_date AND end_date
                GROUP BY day_name, EXTRACT(ISODOW FROM created_at)
                ORDER BY EXTRACT(ISODOW FROM created_at)
            ) t
        ),
        
        -- D. Tech Ranking (Facturación & Valoración)
        'tech_ranking', (
            SELECT json_agg(t) FROM (
                SELECT p.full_name, COUNT(*) as jobs, 
                       COALESCE(SUM(ti.total_amount), 0) as total_revenue
                FROM tickets ti
                JOIN profiles p ON ti.technician_id = p.id
                WHERE ti.status = 'finalizado'
                AND ti.finished_at::DATE BETWEEN start_date AND end_date
                GROUP BY p.full_name
                ORDER BY total_revenue DESC
                LIMIT 5
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION public.get_analytics_kpis(start_date date, end_date date) OWNER TO postgres;

--
-- Name: get_analytics_v2(timestamp with time zone, timestamp with time zone, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_analytics_v2(p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tech_id uuid DEFAULT NULL::uuid, p_zone_cp text DEFAULT NULL::text, p_appliance_type text DEFAULT NULL::text, p_brand_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    result JSON;
    v_total_profiles_count INT;
    v_client_role_count INT;
    v_app_origin_count INT;
    v_visible_tickets INT;
    
    -- Set defaults
    v_start_date TIMESTAMP WITH TIME ZONE := COALESCE(p_start_date, '2000-01-01'::timestamptz);
    v_end_date TIMESTAMP WITH TIME ZONE := COALESCE(p_end_date, NOW());
BEGIN
    -- DIAGNOSTICS: Count what the function can actually SEE
    SELECT COUNT(*) INTO v_total_profiles_count FROM profiles;
    SELECT COUNT(*) INTO v_client_role_count FROM profiles WHERE role = 'client';
    SELECT COUNT(*) INTO v_app_origin_count FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin';
    SELECT COUNT(*) INTO v_visible_tickets FROM tickets;

    WITH filtered_tickets AS (
        SELECT 
            t.id,
            t.created_at,
            t.total_amount,
            t.status,
            t.technician_id,
            t.brand_id,
            COALESCE(b.name, 'Otros') as brand_name,
            COALESCE(p_tech.full_name, 'Sin Asignar') as tech_name,
            COALESCE(p_client.postal_code, '00000') as client_cp,
            COALESCE(t.appliance_info->>'type', 'Otros') as appliance_type
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p_tech ON t.technician_id = p_tech.id
        LEFT JOIN profiles p_client ON t.client_id = p_client.id
        WHERE 
            t.created_at BETWEEN v_start_date AND v_end_date
            AND (p_tech_id IS NULL OR t.technician_id = p_tech_id)
            AND (p_zone_cp IS NULL OR p_client.postal_code ILIKE p_zone_cp || '%')
            AND (p_appliance_type IS NULL OR t.appliance_info->>'type' = p_appliance_type)
            AND (p_brand_id IS NULL OR t.brand_id = p_brand_id)
    ),
    all_clients AS (
        SELECT 
            p.id,
            p.created_at,
            p.created_at as updated_at, -- FIX: 'updated_at' column missing in schema, using 'created_at' fallback
            (SELECT COUNT(*) FROM tickets t WHERE t.client_id = p.id) as ticket_count
        FROM profiles p
        WHERE 
            p.role = 'client'
            AND p.created_via IS DISTINCT FROM 'admin'
    )
    SELECT json_build_object(
        'debug_diagnostics', json_build_object(
            'raw_profile_count', v_total_profiles_count,
            'client_role_count', v_client_role_count,
            'app_origin_count', v_app_origin_count,
            'visible_tickets', v_visible_tickets,
            'status', 'V2 LIVE'
        ),
        'kpis', (
            SELECT COALESCE(json_build_object(
                'total_volume', COUNT(*), 
                'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0), 
                'avg_ticket', COALESCE(ROUND(AVG(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 2), 0), 
                'completion_rate', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('finalizado', 'pagado'))::numeric / COUNT(*)::numeric) * 100, 1) END
            ), '{"total_volume": 0, "total_revenue": 0, "avg_ticket": 0, "completion_rate": 0}'::json) 
            FROM filtered_tickets
        ),
        'market_share', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT brand_name as name, COUNT(*) as value FROM filtered_tickets GROUP BY brand_name ORDER BY value DESC LIMIT 8) x),
        'type_share', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT appliance_type as name, COUNT(*) as value FROM filtered_tickets GROUP BY appliance_type ORDER BY value DESC LIMIT 8) x), -- NEW: Compare Appliances
        'seasonality', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'Mon') as month, TO_CHAR(created_at, 'MM') as month_num, COUNT(*) as tickets, COALESCE(SUM(total_amount), 0) as revenue FROM filtered_tickets GROUP BY month, month_num ORDER BY month_num) x),
        'tech_performance', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT tech_name as name, COUNT(*) as jobs, COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0) as revenue FROM filtered_tickets WHERE technician_id IS NOT NULL GROUP BY tech_name ORDER BY revenue DESC LIMIT 10) x),
        'hot_zones', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT client_cp as postal_code, COUNT(*) as value FROM filtered_tickets GROUP BY client_cp ORDER BY value DESC LIMIT 20) x),
        'top_fault', (SELECT COALESCE((SELECT appliance_type FROM filtered_tickets GROUP BY appliance_type ORDER BY COUNT(*) DESC LIMIT 1), 'N/A')),
        'status_breakdown', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT status, COUNT(*) as count FROM filtered_tickets GROUP BY status ORDER BY count DESC) x),
        'client_adoption', (
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM all_clients),
                'active_30d', (SELECT COUNT(*) FROM all_clients WHERE updated_at > NOW() - INTERVAL '30 days'),
                'conversion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE ticket_count > 0)::numeric / COUNT(*)::numeric) * 100, 1) END FROM all_clients),
                'growth_curve', (SELECT COALESCE(json_agg(gc), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_users FROM all_clients GROUP BY month ORDER BY month) gc)
            )
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION public.get_analytics_v2(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) OWNER TO postgres;

--
-- Name: get_analytics_v3(timestamp with time zone, timestamp with time zone, uuid[], text[], text[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[] DEFAULT NULL::uuid[], p_zone_cps text[] DEFAULT NULL::text[], p_appliance_types text[] DEFAULT NULL::text[], p_brand_ids uuid[] DEFAULT NULL::uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    result JSON;
BEGIN
    WITH filtered_tickets AS (
        SELECT 
            t.id,
            t.total_amount,
            t.status,
            t.created_at,
            t.technician_id,
            t.client_id,
            COALESCE(t.appliance_info->>'type', 'Otros') as appliance_type,
            b.name as brand_name,
            p.postal_code as client_cp,
            tech.full_name as tech_name
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p ON t.client_id = p.id
        LEFT JOIN profiles tech ON t.technician_id = tech.id
        WHERE 
            t.created_at BETWEEN p_start_date AND p_end_date
            AND (p_tech_ids IS NULL OR t.technician_id = ANY(p_tech_ids))
            AND (p_brand_ids IS NULL OR t.brand_id = ANY(p_brand_ids))
            AND (p_appliance_types IS NULL OR COALESCE(t.appliance_info->>'type', 'Otros') = ANY(p_appliance_types))
            -- zone filter if needed later
    ),
    -- 1. Tech Performance (ALL Techs, not just active ones)
    all_techs AS (
        SELECT id, full_name FROM profiles WHERE role = 'tech' AND deleted_at IS NULL
    ),
    tech_stats AS (
        SELECT 
            at.full_name as name,
            COUNT(ft.id) as jobs,
            COALESCE(SUM(ft.total_amount) FILTER (WHERE ft.status IN ('finalizado', 'pagado')), 0) as revenue,
            CASE WHEN COUNT(ft.id) > 0 THEN 'Activo' ELSE 'Sin Actividad' END as status
        FROM all_techs at
        LEFT JOIN filtered_tickets ft ON at.id = ft.technician_id
        WHERE (p_tech_ids IS NULL OR at.id = ANY(p_tech_ids)) -- Apply filter to the list of techs too if specific ones requested
        GROUP BY at.id, at.full_name
        ORDER BY revenue DESC
    ),
    -- 2. Profitability by Type
    type_profitability AS (
        SELECT 
            appliance_type as name,
            COUNT(*) as volume,
            COALESCE(SUM(total_amount), 0) as revenue,
            CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(total_amount) / COUNT(*), 2) END as avg_ticket
        FROM filtered_tickets
        GROUP BY appliance_type
        ORDER BY revenue DESC
    ),
    -- 3. Cross Reference (Brand + Type)
    cross_reference AS (
        SELECT 
            (appliance_type || ' - ' || brand_name) as name,
            COUNT(*) as value,
            COALESCE(SUM(total_amount), 0) as revenue,
            CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(total_amount) / COUNT(*), 2) END as avg_ticket
        FROM filtered_tickets
        GROUP BY appliance_type, brand_name
        ORDER BY value DESC
    )
    SELECT json_build_object(
        'debug_diagnostics', (SELECT json_build_object(
            'version', 'V3.1 CROSS-REF',
            'ticket_count', (SELECT COUNT(*) FROM filtered_tickets),
            'filters', json_build_object('brands', p_brand_ids, 'types', p_appliance_types)
        )),
        'kpis', (
            SELECT json_build_object(
                'total_volume', (SELECT COUNT(*) FROM filtered_tickets),
                'total_revenue', (SELECT COALESCE(SUM(total_amount), 0) FROM filtered_tickets),
                'avg_ticket', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(AVG(total_amount), 2) END FROM filtered_tickets),
                'completion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'finalizado')::numeric / COUNT(*)::numeric) * 100, 1) END FROM filtered_tickets)
            )
        ),
        'market_share', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (SELECT brand_name as name, COUNT(*) as value FROM filtered_tickets GROUP BY brand_name ORDER BY value DESC LIMIT 10) x
        ),
        'type_share', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (SELECT appliance_type as name, COUNT(*) as value FROM filtered_tickets GROUP BY appliance_type ORDER BY value DESC LIMIT 10) x
        ),
        'cross_reference', ( -- NEW FIELD
            SELECT COALESCE(json_agg(x), '[]'::json) FROM cross_reference x
        ),
        'profitability_by_type', (
            SELECT COALESCE(json_agg(x), '[]'::json) FROM type_profitability x
        ),
        'tech_performance', (
            SELECT COALESCE(json_agg(x), '[]'::json) FROM tech_stats x
        ),
        'hot_zones', (
            SELECT COALESCE(json_agg(x), '[]'::json) 
            FROM (
                SELECT client_cp as postal_code, COUNT(*) as value, COALESCE(SUM(total_amount), 0) as revenue 
                FROM filtered_tickets 
                GROUP BY client_cp 
                ORDER BY value DESC LIMIT 50
            ) x
        ),
        'client_adoption', (
             -- Keep V2 Logic (Direct Profile Query, somewhat independent of ticket filters, or should it respect date?)
             -- Usually Client Adoption is "Total System Users", not filtered by ticket brands.
             -- We will respect DATE range for "Active" and "Growth", but Total is Total.
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin'),
                'active_30d', (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin' AND created_at > NOW() - INTERVAL '30 days'), -- Fallback to created_at if updated_at is missing
                'conversion_rate', 50, -- Static for now or calc complex logic
                'growth_curve', (
                    SELECT COALESCE(json_agg(gc), '[]'::json) 
                    FROM (
                        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_users 
                        FROM profiles 
                        WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin' 
                        AND created_at BETWEEN p_start_date AND p_end_date 
                        GROUP BY month ORDER BY month
                    ) gc
                )
            )
        )
    ) INTO result;
    RETURN result;
END;
$$;


ALTER FUNCTION public.get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[], p_zone_cps text[], p_appliance_types text[], p_brand_ids uuid[]) OWNER TO postgres;

--
-- Name: get_business_intelligence(timestamp with time zone, timestamp with time zone, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_business_intelligence(p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tech_id uuid DEFAULT NULL::uuid, p_zone_cp text DEFAULT NULL::text, p_appliance_type text DEFAULT NULL::text, p_brand_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    result JSON;
    v_total_profiles_count INT;
    v_client_role_count INT;
    v_app_origin_count INT;
    v_visible_tickets INT;
    
    -- Set defaults
    v_start_date TIMESTAMP WITH TIME ZONE := COALESCE(p_start_date, '2000-01-01'::timestamptz);
    v_end_date TIMESTAMP WITH TIME ZONE := COALESCE(p_end_date, NOW());
BEGIN
    -- DIAGNOSTICS: Count what the function can actually SEE
    SELECT COUNT(*) INTO v_total_profiles_count FROM profiles;
    SELECT COUNT(*) INTO v_client_role_count FROM profiles WHERE role = 'client';
    SELECT COUNT(*) INTO v_app_origin_count FROM profiles WHERE role = 'client' AND created_via IS DISTINCT FROM 'admin';
    SELECT COUNT(*) INTO v_visible_tickets FROM tickets;

    WITH filtered_tickets AS (
        SELECT 
            t.id,
            t.created_at,
            t.total_amount,
            t.status,
            t.technician_id,
            t.brand_id,
            COALESCE(b.name, 'Otros') as brand_name,
            COALESCE(p_tech.full_name, 'Sin Asignar') as tech_name,
            COALESCE(p_client.postal_code, '00000') as client_cp,
            COALESCE(t.appliance_info->>'type', 'Otros') as appliance_type
        FROM tickets t
        LEFT JOIN brands b ON t.brand_id = b.id
        LEFT JOIN profiles p_tech ON t.technician_id = p_tech.id
        LEFT JOIN profiles p_client ON t.client_id = p_client.id
        WHERE 
            t.created_at BETWEEN v_start_date AND v_end_date
            AND (p_tech_id IS NULL OR t.technician_id = p_tech_id)
            AND (p_zone_cp IS NULL OR p_client.postal_code ILIKE p_zone_cp || '%')
            AND (p_appliance_type IS NULL OR t.appliance_info->>'type' = p_appliance_type)
            AND (p_brand_id IS NULL OR t.brand_id = p_brand_id)
    ),
    all_clients AS (
        SELECT 
            p.id,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM tickets t WHERE t.client_id = p.id) as ticket_count
        FROM profiles p
        WHERE 
            p.role = 'client'
            AND p.created_via IS DISTINCT FROM 'admin'
    )
    SELECT json_build_object(
        'debug_diagnostics', json_build_object(
            'raw_profile_count', v_total_profiles_count,
            'client_role_count', v_client_role_count,
            'app_origin_count', v_app_origin_count,
            'visible_tickets', v_visible_tickets,
            'msg', 'If these are 0, RLS is blocking the function even with SECURITY DEFINER.'
        ),
        'kpis', (
            SELECT COALESCE(json_build_object(
                'total_volume', COUNT(*), 
                'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0), 
                'avg_ticket', COALESCE(ROUND(AVG(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 2), 0), 
                'completion_rate', CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('finalizado', 'pagado'))::numeric / COUNT(*)::numeric) * 100, 1) END
            ), '{"total_volume": 0, "total_revenue": 0, "avg_ticket": 0, "completion_rate": 0}'::json) 
            FROM filtered_tickets
        ),
        'market_share', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT brand_name as name, COUNT(*) as value FROM filtered_tickets GROUP BY brand_name ORDER BY value DESC LIMIT 8) x),
        'seasonality', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'Mon') as month, TO_CHAR(created_at, 'MM') as month_num, COUNT(*) as tickets, COALESCE(SUM(total_amount), 0) as revenue FROM filtered_tickets GROUP BY month, month_num ORDER BY month_num) x),
        'tech_performance', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT tech_name as name, COUNT(*) as jobs, COALESCE(SUM(total_amount) FILTER (WHERE status IN ('finalizado', 'pagado')), 0) as revenue FROM filtered_tickets WHERE technician_id IS NOT NULL GROUP BY tech_name ORDER BY revenue DESC LIMIT 10) x),
        'hot_zones', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT client_cp as postal_code, COUNT(*) as value FROM filtered_tickets GROUP BY client_cp ORDER BY value DESC LIMIT 20) x),
        'top_fault', (SELECT COALESCE((SELECT appliance_type FROM filtered_tickets GROUP BY appliance_type ORDER BY COUNT(*) DESC LIMIT 1), 'N/A')),
        'status_breakdown', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT status, COUNT(*) as count FROM filtered_tickets GROUP BY status ORDER BY count DESC) x),
        'client_adoption', (
            SELECT json_build_object(
                'total_users', (SELECT COUNT(*) FROM all_clients),
                'active_30d', (SELECT COUNT(*) FROM all_clients WHERE updated_at > NOW() - INTERVAL '30 days'),
                'conversion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE ticket_count > 0)::numeric / COUNT(*)::numeric) * 100, 1) END FROM all_clients),
                'growth_curve', (SELECT COALESCE(json_agg(gc), '[]'::json) FROM (SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_users FROM all_clients GROUP BY month ORDER BY month) gc)
            )
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION public.get_business_intelligence(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) OWNER TO postgres;

--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_my_role() RETURNS public.user_role
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;


ALTER FUNCTION public.get_my_role() OWNER TO postgres;

--
-- Name: get_tech_availability(date, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_tech_availability(target_date date, duration_minutes integer, target_cp text DEFAULT NULL::text) RETURNS TABLE(technician_id uuid, technician_name text, slot_start timestamp with time zone, is_optimal_cp boolean, efficiency_score integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    tech RECORD;
    
    -- Dynamic Schedule Variables
    day_key TEXT;
    config_json JSONB;
    day_config JSONB;
    
    w_start TIME;
    w_end TIME;
    
    curr_time TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
    is_conflict BOOLEAN;
    cp_match BOOLEAN;
BEGIN
    -- 1. Determine Day Key (monday, tuesday...)
    -- dow: 0=Sunday, 1=Monday, ... 6=Saturday
    CASE extract(dow from target_date)
        WHEN 1 THEN day_key := 'monday';
        WHEN 2 THEN day_key := 'tuesday';
        WHEN 3 THEN day_key := 'wednesday';
        WHEN 4 THEN day_key := 'thursday';
        WHEN 5 THEN day_key := 'friday';
        WHEN 6 THEN day_key := 'saturday';
        WHEN 0 THEN day_key := 'sunday';
    END CASE;

    -- 2. Fetch Config
    SELECT value INTO config_json FROM business_config WHERE key = 'working_hours';
    
    -- 3. Extract Start/End for that day
    IF config_json IS NOT NULL AND config_json ? day_key THEN
        day_config := config_json -> day_key;
        
        -- If day_config is null (closed), return empty immediately
        IF day_config IS NULL OR day_config = 'null'::jsonb THEN
            RETURN;
        END IF;

        -- Extract times (Default fallback if missing)
        w_start := COALESCE((day_config->>'start')::time, '09:00');
        w_end := COALESCE((day_config->>'end')::time, '19:00');
    ELSE
        -- Fallback if no config found
        w_start := '09:00';
        w_end := '19:00';
    END IF;

    -- 4. Iterate Techs & Slots (Existing Logic)
    FOR tech IN SELECT id, full_name FROM profiles WHERE role = 'tech' AND is_active = true LOOP
        
        -- Start at w_start of target date
        curr_time := (target_date || ' ' || w_start)::timestamptz;
        
        -- Loop until w_end
        WHILE curr_time + (duration_minutes || ' minutes')::interval <= (target_date || ' ' || w_end)::timestamptz LOOP
            slot_end := curr_time + (duration_minutes || ' minutes')::interval;
            
            -- Check overlap with existing DB tickets
            SELECT EXISTS (
                SELECT 1 FROM tickets t
                WHERE t.technician_id = tech.id
                AND t.status::text NOT IN ('cancelado', 'rejected', 'finalizado') 
                AND t.scheduled_at IS NOT NULL
                AND (t.scheduled_at, t.scheduled_end_at) OVERLAPS (curr_time, slot_end)
            ) INTO is_conflict;

            IF NOT is_conflict THEN
                technician_id := tech.id;
                technician_name := tech.full_name;
                slot_start := curr_time;
                is_optimal_cp := FALSE; 
                efficiency_score := 100;
                RETURN NEXT;
            END IF;

            -- Increment by 30 mins
            curr_time := curr_time + '30 minutes'::interval;
        END LOOP;
    END LOOP;
END;
$$;


ALTER FUNCTION public.get_tech_availability(target_date date, duration_minutes integer, target_cp text) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  final_role public.user_role;
  raw_role TEXT;
  next_id INT;
BEGIN
  -- Calcular ID
  SELECT COALESCE(MAX(friendly_id), 0) + 1 INTO next_id FROM public.profiles;

  -- TRADUCIR ROL (El truco clave)
  raw_role := LOWER(COALESCE(new.raw_user_meta_data->>'role', 'client'));
  
  IF raw_role LIKE 't%cnico%' OR raw_role = 'tech' THEN
    final_role := 'tech'::public.user_role;
  ELSIF raw_role LIKE 'admin%' THEN
    final_role := 'admin'::public.user_role;
  ELSE
    final_role := 'client'::public.user_role;
  END IF;

  -- INSERTAR
  INSERT INTO public.profiles (id, full_name, role, email, friendly_id)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'),
    final_role, 
    new.email,
    next_id
  )
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- MODO RESCATE (No fallar nunca)
  INSERT INTO public.profiles (id, full_name, role, email, friendly_id)
  VALUES (new.id, 'Usuario Rescatado', 'client'::public.user_role, new.email, next_id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: have_permission(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.have_permission(perm_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (permissions->>perm_key)::boolean = true
  );
END;
$$;


ALTER FUNCTION public.have_permission(perm_key text) OWNER TO postgres;

--
-- Name: increment_completed_services(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_completed_services() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- If status changed to 'finalizado'
    IF NEW.status = 'finalizado' AND OLD.status != 'finalizado' THEN
        UPDATE public.profiles
        SET completed_services = completed_services + 1
        WHERE id = NEW.technician_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.increment_completed_services() OWNER TO postgres;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Esta consulta se ejecuta con permisos de sistema, ignorando las reglas normales
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION public.is_admin() OWNER TO postgres;

--
-- Name: manage_brand(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.manage_brand(brand_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    b_id UUID;
    clean_name TEXT;
BEGIN
    clean_name := INITCAP(TRIM(brand_name));
    
    SELECT id INTO b_id FROM brands WHERE name = clean_name;
    
    IF b_id IS NULL THEN
        INSERT INTO brands (name) VALUES (clean_name) RETURNING id INTO b_id;
    END IF;
    
    RETURN b_id;
END;
$$;


ALTER FUNCTION public.manage_brand(brand_name text) OWNER TO postgres;

--
-- Name: merge_clients(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.merge_clients(source_id uuid, target_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    tickets_moved INT := 0;
    appliances_moved INT := 0;
    addresses_moved INT := 0;
    source_name TEXT;
    target_name TEXT;
BEGIN
    -- Validar que ambos IDs existen
    SELECT full_name INTO source_name FROM profiles WHERE id = source_id;
    SELECT full_name INTO target_name FROM profiles WHERE id = target_id;
    
    IF source_name IS NULL THEN
        RAISE EXCEPTION 'Cliente origen (%) no existe', source_id;
    END IF;
    
    IF target_name IS NULL THEN
        RAISE EXCEPTION 'Cliente destino (%) no existe', target_id;
    END IF;
    
    IF source_id = target_id THEN
        RAISE EXCEPTION 'No se puede fusionar un cliente consigo mismo';
    END IF;

    -- 1. Mover tickets del origen al destino
    UPDATE tickets 
    SET client_id = target_id 
    WHERE client_id = source_id;
    GET DIAGNOSTICS tickets_moved = ROW_COUNT;
    
    -- 2. Mover appliances
    UPDATE appliances 
    SET client_id = target_id 
    WHERE client_id = source_id;
    GET DIAGNOSTICS appliances_moved = ROW_COUNT;
    
    -- 3. Mover direcciones (evitar duplicados por label)
    UPDATE client_addresses ca_source
    SET client_id = target_id
    WHERE ca_source.client_id = source_id
      AND NOT EXISTS (
          SELECT 1 FROM client_addresses ca_target
          WHERE ca_target.client_id = target_id
            AND ca_target.address_line = ca_source.address_line
      );
    GET DIAGNOSTICS addresses_moved = ROW_COUNT;
    
    -- 4. Eliminar direcciones duplicadas que quedaron
    DELETE FROM client_addresses WHERE client_id = source_id;
    
    -- 5. Eliminar perfil origen
    DELETE FROM profiles WHERE id = source_id;
    
    -- Retornar resumen
    RETURN jsonb_build_object(
        'success', true,
        'merged', jsonb_build_object(
            'source_id', source_id,
            'source_name', source_name,
            'target_id', target_id,
            'target_name', target_name
        ),
        'moved', jsonb_build_object(
            'tickets', tickets_moved,
            'appliances', appliances_moved,
            'addresses', addresses_moved
        )
    );
END;
$$;


ALTER FUNCTION public.merge_clients(source_id uuid, target_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION merge_clients(source_id uuid, target_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.merge_clients(source_id uuid, target_id uuid) IS 'Fusiona cliente origen en destino: mueve tickets, appliances y addresses, luego elimina origen.';


--
-- Name: normalize_phone(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.normalize_phone(phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    clean TEXT;
BEGIN
    IF phone IS NULL OR phone = '' THEN
        RETURN NULL;
    END IF;
    
    -- Quitar todo excepto dígitos
    clean := regexp_replace(phone, '\D', '', 'g');
    
    -- Quitar prefijo 34 si tiene más de 9 dígitos
    IF length(clean) > 9 AND clean LIKE '34%' THEN
        clean := substring(clean from 3);
    END IF;
    
    -- Validar que tenga 9 dígitos (España)
    IF length(clean) != 9 THEN
        RETURN clean; -- Devolver sin modificar si no es válido
    END IF;
    
    RETURN clean;
END;
$$;


ALTER FUNCTION public.normalize_phone(phone text) OWNER TO postgres;

--
-- Name: FUNCTION normalize_phone(phone text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.normalize_phone(phone text) IS 'Normaliza teléfono a formato estándar de 9 dígitos (España). Quita espacios, guiones y prefijo +34.';


--
-- Name: normalize_phone_before_save(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.normalize_phone_before_save() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.normalize_phone_before_save() OWNER TO postgres;

--
-- Name: trigger_auto_harvest_brand(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_auto_harvest_brand() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if brand is present
    IF NEW.brand IS NOT NULL THEN
        -- Insert into brands table safely
        INSERT INTO brands (name)
        VALUES (NEW.brand)
        ON CONFLICT (name) DO NOTHING;
    END IF;

    -- CRITICAL: Always return NEW, otherwise Insert fails (406 in Supabase context)
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Failsafe: Log error but allow insert to proceed
        RAISE WARNING 'Auto-Harvest Brand Failed: %', SQLERRM;
        RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_auto_harvest_brand() OWNER TO postgres;

--
-- Name: trigger_auto_mortify_on_close(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_auto_mortify_on_close() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    existing_assessment RECORD;
    new_admin_note TEXT := 'Actualización automática tras reparación. Gasto acumulado incrementado.';
BEGIN
    -- Only trigger when status changes to 'finalizado' or 'pagado'
    -- AND the previous status was NOT 'finalizado' or 'pagado'
    -- Also checking 'finalizado' string just in case
    IF (NEW.status IN ('finalizado', 'pagado') OR NEW.is_paid = true) AND (OLD.status NOT IN ('finalizado', 'pagado') AND OLD.is_paid = false) THEN
        
        -- Check if there is ANY existing Mortify assessment for this appliance
        SELECT * INTO existing_assessment
        FROM mortify_assessments
        WHERE appliance_id = NEW.appliance_id
        ORDER BY created_at DESC
        LIMIT 1;

        -- If an assessment exists, we create a NEW one (Re-evaluation)
        IF FOUND THEN
            INSERT INTO mortify_assessments (
                appliance_id,
                -- client_id removed (not in schema)
                total_score,
                status,
                -- is_premium_check removed (not in schema)
                admin_note,
                ia_suggestion,
                created_at
            ) VALUES (
                NEW.appliance_id,
                existing_assessment.total_score, 
                'PENDING_JUDGE', 
                new_admin_note,
                'Re-evaluación automática solicitada por cierre de reparación.',
                NOW()
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_auto_mortify_on_close() OWNER TO postgres;

--
-- Name: trigger_mortify_insert_recalc(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_mortify_insert_recalc() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Force recalculate immediately after insertion
    PERFORM fn_calculate_mortify_score(NEW.appliance_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_mortify_insert_recalc() OWNER TO postgres;

--
-- Name: trigger_mortify_v13_god_tier(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_mortify_v13_god_tier() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_app_id UUID;
    v_app_brand TEXT;
    v_app_year INT;
    v_app_type TEXT;
    v_housing_type TEXT;
    v_floor_level INT;
    
    -- Config
    v_base_market_price NUMERIC := 700; -- DEFAULT SYNCED WITH FRONTEND
    v_lifespan INT := 10;
    
    -- Scores
    v_brand_score_db INT;
    v_prestige_multiplier NUMERIC := 1.0;
    v_prestige_price NUMERIC;
    v_score_brand INT := 1;
    v_score_age_pts INT := 0;
    v_score_install INT := 3;
    v_score_fin INT := 10;
    v_total_score INT := 0;
    
    -- Fin
    v_age INT;
    v_current_value NUMERIC;
    v_total_spent NUMERIC := 0;
    v_spend_ratio NUMERIC;
    v_limit_ratio NUMERIC := 0.51;
    
    v_template_text TEXT;
    v_existing_id UUID;
BEGIN
    -- Context
    IF TG_TABLE_NAME = 'tickets' THEN
        v_app_id := NEW.appliance_id;
    ELSE
        v_app_id := NEW.id;
    END IF;

    -- Load App Data
    SELECT brand, purchase_year, type, housing_type, floor_level
    INTO v_app_brand, v_app_year, v_app_type, v_housing_type, v_floor_level
    FROM client_appliances WHERE id = v_app_id;

    -- Load Defaults
    SELECT average_market_price, average_lifespan_years 
    INTO v_base_market_price, v_lifespan 
    FROM appliance_category_defaults WHERE category_name ILIKE v_app_type LIMIT 1;
    
    IF v_base_market_price IS NULL THEN v_base_market_price := 700; END IF;
    IF v_lifespan IS NULL THEN v_lifespan := 10; END IF;

    -- Brand Score (1-4)
    SELECT score_points INTO v_brand_score_db
    FROM mortify_brand_scores WHERE brand_name ILIKE v_app_brand LIMIT 1;
    IF v_brand_score_db IS NULL THEN v_brand_score_db := 2; END IF;

    -- Prestige
    IF v_brand_score_db >= 4 THEN v_prestige_multiplier := 2.2;
    ELSIF v_brand_score_db = 3 THEN v_prestige_multiplier := 1.6;
    ELSIF v_brand_score_db = 2 THEN v_prestige_multiplier := 1.25;
    ELSE v_prestige_multiplier := 1.0; END IF;

    v_prestige_price := v_base_market_price * v_prestige_multiplier;
    v_score_brand := v_brand_score_db;

    -- Age
    v_age := EXTRACT(YEAR FROM NOW()) - v_app_year;
    IF v_age < 0 OR v_age IS NULL THEN v_age := 0; END IF;

    IF v_age <= 2 THEN v_score_age_pts := 5;
    ELSIF v_age <= 4 THEN v_score_age_pts := 4;
    ELSIF v_age <= 6 THEN v_score_age_pts := 3;
    ELSIF v_age <= 8 THEN v_score_age_pts := 2;
    ELSIF v_age <= 10 THEN v_score_age_pts := 1;
    ELSE v_score_age_pts := 0; END IF;

    -- Installation
    IF (v_housing_type ILIKE '%chalet%' OR v_housing_type ILIKE '%casa%') THEN
        v_score_install := 5;
    ELSIF (v_floor_level <= 0 OR v_floor_level IS NULL) THEN
        v_score_install := 5;
    ELSE
        v_score_install := 3;
    END IF;

    -- Financial
    IF v_age >= 3 AND v_age <= 7 THEN v_limit_ratio := 0.70; END IF;

    IF v_age >= v_lifespan THEN
        v_current_value := 0;
    ELSE
        v_current_value := v_prestige_price * (1.0 - (v_age::NUMERIC / v_lifespan::NUMERIC));
    END IF;

    SELECT COALESCE(SUM(final_price), 0) INTO v_total_spent
    FROM tickets
    WHERE appliance_id = v_app_id AND (status IN ('finalizado', 'pagado') OR is_paid = true);

    -- Logic
    IF v_current_value <= 0 THEN
         v_score_fin := 0;
         v_template_text := 'Amortizado. Valor residual 0.';
    ELSIF v_total_spent = 0 THEN
         -- NEW CONDITION: PERFECT SCORE IF NOTHING SPENT
         v_score_fin := 10;
         v_template_text := 'Impecable. Sin gastos previos.';
    ELSE
        v_spend_ratio := v_total_spent / NULLIF(v_current_value, 1);
        IF v_spend_ratio > v_limit_ratio THEN
            v_score_fin := 0;
            v_template_text := 'Riesgo Financiero Excesivo.';
        ELSE
            v_score_fin := ROUND(10 * (1.0 - (v_spend_ratio / v_limit_ratio)));
            if v_score_fin < 1 THEN v_score_fin := 1; END IF;
            v_template_text := 'Operación Viable.';
        END IF;
    END IF;
    
    -- TOTAL SUM
    v_total_score := v_score_brand + v_score_age_pts + v_score_install + v_score_fin;
    
    -- Veto override
    IF v_score_fin = 0 THEN 
        v_total_score := 0; -- Or keep points but mark as obsolete? 
        -- User wants score to reflect reality. If obsolete, score implies dying.
        -- Let's force 0 to match current UX "Zona de Muerte".
        -- Or maybe 14/24 Obsolete is confusing.
        -- But for now, sticking to current logic: Fin=0 -> Total=0?
        -- Wait, previous log said Total 14. That implies Fin=0 but Total NOT zeroed?
        -- Let's check my previous script logic.
        -- "IF v_score_fin = 0 THEN v_total_score := 0;" was there.
        -- So if user sees 14, then Fin != 0?
        -- 4+5+5+X = 14 => X=0.
        -- If X=0, then Total=0. 
        -- Impossible.
        -- UNLESS the previous trigger DID NOT have the zeroing line?
        -- OR v_score_fin was NULL?
        
        -- Safe bet: Force total score calc.
    END IF;

    -- UPDATE ONLY
    UPDATE mortify_assessments SET
        score_brand = v_score_brand,
        score_age = v_score_age_pts,
        score_installation = v_score_install,
        score_financial = v_score_fin,
        total_score = v_total_score,
        admin_note = v_template_text,
        ia_suggestion = CASE 
            WHEN v_score_fin = 0 THEN 'OBSOLETE'
            WHEN v_total_score >= 18 THEN 'VIABLE'
            ELSE 'DOUBTFUL'
        END,
        created_at = NOW()
    WHERE appliance_id = v_app_id AND status = 'PENDING_JUDGE';

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_mortify_v13_god_tier() OWNER TO postgres;

--
-- Name: trigger_reopen_mortify_on_ticket(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_reopen_mortify_on_ticket() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_assessment_id UUID;
BEGIN
    SELECT id INTO v_assessment_id FROM mortify_assessments WHERE appliance_id = NEW.appliance_id LIMIT 1;
    IF v_assessment_id IS NULL THEN RETURN NEW; END IF;

    IF (NEW.status IN ('finalizado', 'pagado')) AND (OLD.status NOT IN ('finalizado', 'pagado')) THEN
        PERFORM fn_calculate_mortify_score(NEW.appliance_id);
        UPDATE mortify_assessments
        SET status = 'PENDING_JUDGE',
            admin_note = 'Actualización automática tras cierre de expediente #' || substring(NEW.id::text, 1, 8),
            updated_at = NOW()
        WHERE id = v_assessment_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_reopen_mortify_on_ticket() OWNER TO postgres;

--
-- Name: update_address_last_used(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_address_last_used() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE client_addresses
    SET last_used_at = NOW()
    WHERE id = NEW.address_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_address_last_used() OWNER TO postgres;

--
-- Name: update_client_address_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_client_address_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_client_address_timestamp() OWNER TO postgres;

--
-- Name: update_conversation_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_conversation_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.message_count = COALESCE(OLD.message_count, 0) + 1;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_conversation_timestamp() OWNER TO postgres;

--
-- Name: update_technician_stats(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_technician_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    target_tech_id UUID;
    new_avg NUMERIC(3,1);
    new_count INTEGER;
BEGIN
    -- Determine tech id
    IF (TG_OP = 'DELETE') THEN
        target_tech_id := OLD.technician_id;
    ELSE
        target_tech_id := NEW.technician_id;
    END IF;

    -- Calculate
    SELECT 
        COALESCE(AVG(rating), 0), 
        COUNT(*) 
    INTO 
        new_avg, 
        new_count 
    FROM reviews 
    WHERE technician_id = target_tech_id;

    -- Update Profile
    UPDATE profiles 
    SET 
        avg_rating = ROUND(new_avg, 1),
        total_reviews = new_count
    WHERE id = target_tech_id;

    RETURN NULL;
END;
$$;


ALTER FUNCTION public.update_technician_stats() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: validate_address_limit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_address_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    client_type_val client_type_enum;
    current_count INT;
    max_allowed INT;
BEGIN
    -- Obtener tipo de cliente
    SELECT client_type INTO client_type_val
    FROM profiles
    WHERE id = NEW.client_id;
    
    -- Determinar límite
    IF client_type_val = 'professional' THEN
        max_allowed := 15;
    ELSE
        max_allowed := 3;
    END IF;
    
    -- Contar direcciones actuales (excluyendo la actual si es UPDATE)
    SELECT COUNT(*) INTO current_count
    FROM client_addresses
    WHERE client_id = NEW.client_id
      AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    -- Validar límite
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Límite de direcciones alcanzado. Tipo: %, Máximo: %', 
            client_type_val, max_allowed;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.validate_address_limit() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appliance_category_defaults; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appliance_category_defaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name character varying(50) NOT NULL,
    average_market_price numeric DEFAULT 0,
    average_lifespan_years integer DEFAULT 10,
    base_installation_difficulty integer DEFAULT 0
);


ALTER TABLE public.appliance_category_defaults OWNER TO postgres;

--
-- Name: appliance_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appliance_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.appliance_types OWNER TO postgres;

--
-- Name: appliances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appliances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    address_id uuid,
    type character varying(100) NOT NULL,
    brand character varying(100),
    model character varying(100),
    serial_number character varying(100),
    purchase_year integer,
    photo_front text,
    photo_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.appliances OWNER TO postgres;

--
-- Name: brands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tier text DEFAULT 'standard'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    logo_url text
);


ALTER TABLE public.brands OWNER TO postgres;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_number integer NOT NULL,
    client_id uuid,
    title text DEFAULT 'Presupuesto de Reparación'::text,
    description text,
    appliance_info jsonb,
    labor_items jsonb DEFAULT '[]'::jsonb,
    part_items jsonb DEFAULT '[]'::jsonb,
    total_amount numeric(10,2) DEFAULT 0,
    deposit_amount numeric(10,2) DEFAULT 0,
    deposit_percentage_materials integer DEFAULT 100,
    deposit_percentage_labor integer DEFAULT 0,
    payment_terms text,
    status text DEFAULT 'pending'::text,
    created_via text DEFAULT 'admin_panel'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    valid_until timestamp with time zone DEFAULT (now() + '15 days'::interval),
    pdf_url text,
    converted_ticket_id uuid
);


ALTER TABLE public.budgets OWNER TO postgres;

--
-- Name: budgets_budget_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.budgets_budget_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budgets_budget_number_seq OWNER TO postgres;

--
-- Name: budgets_budget_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.budgets_budget_number_seq OWNED BY public.budgets.budget_number;


--
-- Name: business_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.business_config (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    opening_time text DEFAULT '09:00'::text,
    closing_time text DEFAULT '19:00'::text,
    working_hours jsonb
);


ALTER TABLE public.business_config OWNER TO postgres;

--
-- Name: client_addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    label character varying(50) DEFAULT 'Vivienda Principal'::character varying NOT NULL,
    address_line text NOT NULL,
    floor character varying(20),
    apartment character varying(20),
    postal_code character varying(10),
    city character varying(100),
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now(),
    address_order integer DEFAULT 1
);


ALTER TABLE public.client_addresses OWNER TO postgres;

--
-- Name: TABLE client_addresses; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.client_addresses IS 'Direcciones múltiples para clientes. Fase 1 del sistema multi-dirección.';


--
-- Name: COLUMN client_addresses.label; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.client_addresses.label IS 'Etiqueta: Vivienda Principal, Oficina, Segunda Residencia, Otro';


--
-- Name: COLUMN client_addresses.is_primary; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.client_addresses.is_primary IS 'Solo una dirección por cliente puede ser principal (constraint único parcial)';


--
-- Name: client_appliances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_appliances (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    client_id uuid,
    type text NOT NULL,
    brand text NOT NULL,
    model text,
    serial_number text,
    location text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    purchase_date date,
    warranty_expiry date,
    photo_model text,
    photo_location text,
    photo_overview text,
    purchase_year integer,
    initial_value_estimate numeric,
    repair_count integer DEFAULT 0,
    expert_override boolean DEFAULT false,
    expert_note text,
    housing_type text,
    floor_level integer DEFAULT 0
);

ALTER TABLE ONLY public.client_appliances REPLICA IDENTITY FULL;


ALTER TABLE public.client_appliances OWNER TO postgres;

--
-- Name: COLUMN client_appliances.purchase_year; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.client_appliances.purchase_year IS 'Year the appliance was purchased. Used for age calculation.';


--
-- Name: COLUMN client_appliances.initial_value_estimate; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.client_appliances.initial_value_estimate IS 'Estimated value when new. Used for viability threshold.';


--
-- Name: COLUMN client_appliances.expert_override; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.client_appliances.expert_override IS 'If true, ignores calculated viability and forces "Repairable".';


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text DEFAULT 'Tech Service'::text,
    logo_url text,
    primary_color text DEFAULT '#2563eb'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    company_address text,
    company_phone text,
    company_email text,
    company_tax_id text,
    legal_terms text DEFAULT 'Garantía de 3 meses.'::text,
    tax_rate numeric DEFAULT 21,
    company_signature_url text
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    description text,
    stock_quantity integer DEFAULT 0 NOT NULL,
    cost_price numeric(10,2) NOT NULL,
    sale_price numeric(10,2) NOT NULL,
    warranty_months integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.inventory OWNER TO postgres;

--
-- Name: mortify_assessments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mortify_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    appliance_id uuid,
    input_year integer,
    input_floor_level integer,
    score_brand integer DEFAULT 0,
    score_age integer DEFAULT 0,
    score_installation integer DEFAULT 0,
    score_financial integer DEFAULT 0,
    total_score integer DEFAULT 0,
    ia_suggestion text,
    status character varying(20) DEFAULT 'PENDING_JUDGE'::character varying,
    admin_verdict character varying(50),
    admin_note text,
    admin_decision_date timestamp with time zone,
    admin_recovered_points integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.mortify_assessments REPLICA IDENTITY FULL;


ALTER TABLE public.mortify_assessments OWNER TO postgres;

--
-- Name: mortify_brand_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mortify_brand_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_name text NOT NULL,
    score_points integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mortify_brand_scores_score_points_check CHECK (((score_points >= 1) AND (score_points <= 4)))
);


ALTER TABLE public.mortify_brand_scores OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text,
    full_name text,
    role public.user_role DEFAULT 'client'::public.user_role,
    avatar_url text,
    phone text,
    address text,
    current_location public.geography(Point,4326),
    is_available boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active boolean DEFAULT true,
    province text,
    postal_code text,
    phone_2 text,
    created_via text DEFAULT 'app'::text,
    city text,
    floor text,
    apartment text,
    notes text,
    permissions jsonb DEFAULT '{}'::jsonb,
    is_super_admin boolean DEFAULT false,
    deleted_at timestamp with time zone,
    dni text,
    friendly_id integer,
    current_lat double precision,
    current_lng double precision,
    last_location_update timestamp with time zone,
    avg_rating numeric(3,2) DEFAULT 0.00,
    total_reviews integer DEFAULT 0,
    completed_services integer DEFAULT 0,
    street_type text,
    street_name text,
    street_number text,
    contact_email text,
    username text,
    bypass_time_restrictions boolean DEFAULT false,
    status text DEFAULT 'active'::text,
    status_reason text,
    has_mortify boolean DEFAULT false,
    latitude double precision,
    longitude double precision,
    client_type public.client_type_enum DEFAULT 'particular'::public.client_type_enum,
    registration_source text DEFAULT 'office'::text
);

ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: COLUMN profiles.floor; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.floor IS 'Planta o Piso (e.g., 2º, Bajo)';


--
-- Name: COLUMN profiles.apartment; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.apartment IS 'Puerta, Letra o Oficina (e.g., A, Izquierda)';


--
-- Name: COLUMN profiles.bypass_time_restrictions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.bypass_time_restrictions IS 'If true, technician can start jobs outside working hours (Testing Mode).';


--
-- Name: COLUMN profiles.client_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.client_type IS 'Tipo de cliente: particular (max 3 dirs) o professional (max 15 dirs). Decisión permanente en registro.';


--
-- Name: profiles_friendly_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.profiles_friendly_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.profiles_friendly_id_seq OWNER TO postgres;

--
-- Name: profiles_friendly_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.profiles_friendly_id_seq OWNED BY public.profiles.friendly_id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    client_id uuid,
    rating integer,
    badges text[] DEFAULT '{}'::text[],
    comment text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: service_catalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_catalog (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    base_price numeric DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.service_catalog OWNER TO postgres;

--
-- Name: service_parts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_at_time numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.service_parts OWNER TO postgres;

--
-- Name: service_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    estimated_duration_min integer DEFAULT 60 NOT NULL,
    buffer_time_min integer DEFAULT 30 NOT NULL,
    color_code text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.service_types OWNER TO postgres;

--
-- Name: service_zones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    province text NOT NULL,
    cities text[] NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.service_zones OWNER TO postgres;

--
-- Name: technician_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.technician_locations (
    technician_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    heading double precision DEFAULT 0,
    speed double precision DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.technician_locations OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number integer NOT NULL,
    client_id uuid NOT NULL,
    technician_id uuid,
    appliance_info jsonb,
    status public.ticket_status DEFAULT 'solicitado'::public.ticket_status NOT NULL,
    description_failure text,
    diagnosis_notes text,
    labor_cost numeric(10,2) DEFAULT 0.00,
    parts_total numeric(10,2) DEFAULT 0.00,
    total_price numeric(10,2) DEFAULT 0.00,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ai_diagnosis text,
    pdf_url text,
    pdf_sent_to_client boolean DEFAULT false,
    created_by uuid,
    tech_diagnosis text,
    tech_solution text,
    parts_list jsonb DEFAULT '[]'::jsonb,
    labor_list jsonb DEFAULT '[]'::jsonb,
    deposit_amount numeric DEFAULT 0,
    is_paid boolean DEFAULT false,
    payment_method text,
    payment_proof_url text,
    pdf_generated_at timestamp with time zone,
    appointment_status text DEFAULT 'pending'::text,
    client_feedback text,
    proposed_slots jsonb DEFAULT '[]'::jsonb,
    appliance_id uuid,
    quote_generated_at timestamp with time zone,
    status_history jsonb DEFAULT '[]'::jsonb,
    quote_pdf_url text,
    payment_deposit numeric(10,2) DEFAULT 0,
    payment_terms text,
    origin_source text DEFAULT 'direct'::text,
    created_via text DEFAULT 'manual'::text,
    total_amount numeric(10,2) DEFAULT 0,
    estimated_duration integer DEFAULT 60,
    required_parts_description text,
    material_status_at timestamp with time zone,
    deposit_receipt_url text,
    material_ordered boolean DEFAULT false,
    material_supplier text,
    service_type_id uuid,
    scheduled_end_at timestamp with time zone,
    brand_id uuid,
    cancellation_reason text,
    final_price numeric(10,2),
    is_warranty boolean DEFAULT false,
    original_ticket_id uuid,
    warranty_until timestamp with time zone,
    warranty_labor_until timestamp with time zone,
    warranty_parts_until timestamp with time zone,
    warranty_labor_months integer DEFAULT 3,
    warranty_parts_months integer DEFAULT 24,
    updated_at timestamp with time zone DEFAULT now(),
    link_ticket_id uuid,
    warranty_pdf_url text,
    material_ordered_by uuid,
    material_received_by uuid,
    material_received boolean DEFAULT false,
    material_deposit_pdf_url text,
    pdf_sent_at timestamp with time zone,
    pdf_sent_via text,
    pdf_sent_to text,
    reminder_sent boolean DEFAULT false,
    departure_notification_sent boolean DEFAULT false,
    address_id uuid,
    CONSTRAINT tickets_appointment_status_check CHECK ((appointment_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.tickets REPLICA IDENTITY FULL;


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: COLUMN tickets.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.created_by IS 'User ID of the admin/subadmin who created this ticket';


--
-- Name: COLUMN tickets.proposed_slots; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.proposed_slots IS 'Array de opciones: [{date: "YYYY-MM-DD", time: "HH:MM"}]';


--
-- Name: COLUMN tickets.quote_pdf_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.quote_pdf_url IS 'URL of the generated quote PDF';


--
-- Name: COLUMN tickets.origin_source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.origin_source IS 'Source of the ticket: direct, admin_budget, web_form, etc.';


--
-- Name: COLUMN tickets.estimated_duration; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.estimated_duration IS 'Estimated service duration in minutes';


--
-- Name: COLUMN tickets.cancellation_reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.cancellation_reason IS 'Reason provided by client when cancelling service';


--
-- Name: COLUMN tickets.is_warranty; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.is_warranty IS 'If true, this ticket is a warranty claim';


--
-- Name: COLUMN tickets.original_ticket_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.original_ticket_id IS 'Link to the original repair ticket that is covered by this warranty';


--
-- Name: COLUMN tickets.warranty_until; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.warranty_until IS 'The date until which the repair performed in THIS ticket is guaranteed.';


--
-- Name: COLUMN tickets.warranty_labor_until; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.warranty_labor_until IS 'Expiration of Labor Warranty';


--
-- Name: COLUMN tickets.warranty_parts_until; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.warranty_parts_until IS 'Expiration of Parts Warranty';


--
-- Name: COLUMN tickets.material_ordered_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.material_ordered_by IS 'User ID of the person who marked the material as ordered';


--
-- Name: COLUMN tickets.material_received_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tickets.material_received_by IS 'User ID of the person who marked the material as received';


--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tickets_ticket_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tickets_ticket_number_seq OWNER TO postgres;

--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tickets_ticket_number_seq OWNED BY public.tickets.ticket_number;


--
-- Name: v_duplicate_phones; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_duplicate_phones AS
 SELECT public.normalize_phone(phone) AS normalized_phone,
    count(*) AS count,
    array_agg(id) AS profile_ids,
    array_agg(full_name) AS names,
    array_agg(created_at ORDER BY created_at) AS created_dates
   FROM public.profiles
  WHERE ((role = 'client'::public.user_role) AND (phone IS NOT NULL))
  GROUP BY (public.normalize_phone(phone))
 HAVING (count(*) > 1)
  ORDER BY (count(*)) DESC, (public.normalize_phone(phone));


ALTER VIEW public.v_duplicate_phones OWNER TO postgres;

--
-- Name: VIEW v_duplicate_phones; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_duplicate_phones IS 'Muestra teléfonos duplicados para revisión manual.';


--
-- Name: warranties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warranties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date NOT NULL,
    pdf_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.warranties OWNER TO postgres;

--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(20) NOT NULL,
    current_step character varying(50) DEFAULT 'greeting'::character varying NOT NULL,
    collected_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    message_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.whatsapp_conversations OWNER TO postgres;

--
-- Name: TABLE whatsapp_conversations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.whatsapp_conversations IS 'Almacena el estado de conversaciones activas del bot WhatsApp';


--
-- Name: COLUMN whatsapp_conversations.current_step; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_conversations.current_step IS 'Estado actual: greeting, ask_appliance, ask_brand, ask_model, ask_problem, ask_address, ask_name, ask_phone, create_ticket';


--
-- Name: COLUMN whatsapp_conversations.collected_data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.whatsapp_conversations.collected_data IS 'Datos recolectados: {appliance, brand, model, problem, address, name, phone}';


--
-- Name: budgets budget_number; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets ALTER COLUMN budget_number SET DEFAULT nextval('public.budgets_budget_number_seq'::regclass);


--
-- Name: profiles friendly_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles ALTER COLUMN friendly_id SET DEFAULT nextval('public.profiles_friendly_id_seq'::regclass);


--
-- Name: tickets ticket_number; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets ALTER COLUMN ticket_number SET DEFAULT nextval('public.tickets_ticket_number_seq'::regclass);


--
-- Data for Name: appliance_category_defaults; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appliance_category_defaults (id, category_name, average_market_price, average_lifespan_years, base_installation_difficulty) FROM stdin;
fef44ec4-ed63-45df-9add-fdb9eff987a6	Aire Acondicionado	600	12	1
3819c4bc-dfd2-4097-84f9-d1b1c7f6456d	caldera	2000	10	0
4da53a59-1a50-4ac2-a204-34be6d2ff3b7	Calentador	250	10	1
e2cdbe71-1295-42f0-92c1-aa296a81207b	Campana	200	15	0
58635066-8aa3-472c-afd0-a73f9115e847	Frigorífico	700	12	0
ca6a2069-9e94-4596-9d02-ad0985567b7b	Horno	350	15	0
6324f77d-93a9-4a41-80b0-832f07e90e1d	Lavadora	600	10	0
acbcc425-ba28-4a0e-8b89-99d9be5fc553	Lavavajillas	500	10	0
590a393f-da42-4937-96c4-c2733feefc93	Refrigerator	700	12	0
8b162c39-8a9c-4bbb-b5b1-adab832e41d6	Secadora	400	10	0
4ac9a46d-1298-4018-8153-4112adc88f5e	Termo	150	8	0
914b9526-cf53-4d3c-b803-f7ebee5743b1	Vitrocerámica	300	10	0
\.


--
-- Data for Name: appliance_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appliance_types (id, name, created_at) FROM stdin;
e48cb0a8-605e-4b70-a1b9-76c211d1f706	Lavadora	2026-01-04 14:59:42.176809+00
e101f1f8-cd0f-45ab-ba04-abdd89b50a95	Secadora	2026-01-04 14:59:42.176809+00
819682b0-d3b0-44a8-8cca-eced481c945c	Lavavajillas	2026-01-04 14:59:42.176809+00
8d407c36-aeab-4c1b-9312-8dde2d04910f	Frigorífico	2026-01-04 14:59:42.176809+00
5d975916-9535-48fa-91da-7066bf99ecdf	Congelador	2026-01-04 14:59:42.176809+00
91250487-8222-458a-802b-85033f248d54	Horno	2026-01-04 14:59:42.176809+00
ebf1f284-2265-4a8c-a776-c3fba6fdb71e	Vitrocerámica	2026-01-04 14:59:42.176809+00
15cf0f99-696a-405e-94db-2b46354fb4f7	Campana	2026-01-04 14:59:42.176809+00
5f328bcf-ba8b-4cbf-a414-72f3f7fe9f20	Microondas	2026-01-04 14:59:42.176809+00
fe819604-f209-4e38-9a6b-b6d1048198c1	Termo Eléctrico	2026-01-04 14:59:42.176809+00
6f75d448-785a-4884-bf1f-6cf3b5b7dfbc	Aire Acondicionado	2026-01-04 14:59:42.176809+00
4084bc77-d883-458d-a3df-36044ddc0008	Caldera	2026-01-04 14:59:42.176809+00
a14a48c7-3c1b-4dc9-80d4-46ba3e3c6215	Otro	2026-01-04 14:59:42.176809+00
\.


--
-- Data for Name: appliances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appliances (id, client_id, address_id, type, brand, model, serial_number, purchase_year, photo_front, photo_label, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.brands (id, name, tier, is_active, created_at, logo_url) FROM stdin;
4074c119-5b48-4d0b-ae4a-90c8ae6d9113	Jjduus	standard	t	2026-01-08 00:01:08.836246+00	\N
43b1a137-557f-42b2-85d6-259d8ee56a1f	Samsung	standard	t	2026-01-08 00:13:36.746073+00	\N
1ca351cc-8ec6-4535-8db5-245d57677673	LG	standard	t	2026-01-08 00:13:36.746073+00	\N
80cde13d-ebea-4932-967a-bd63a43278b7	Bosch	premium	t	2026-01-08 00:13:36.746073+00	\N
17ee162c-f4ea-4878-b4ca-7c7c7242b479	Siemens	premium	t	2026-01-08 00:13:36.746073+00	\N
167a0a14-3631-4a1a-8acd-49d6bad0960a	Whirlpool	standard	t	2026-01-08 00:13:36.746073+00	\N
12a9a0fe-806e-40c2-8c99-dc710df400cd	Indesit	budget	t	2026-01-08 00:13:36.746073+00	\N
ad5663bf-71a1-4025-a5c3-7eb3e0b094a0	Tekame	budget	t	2026-01-08 00:13:36.746073+00	\N
ab1eb675-29dc-4612-bc22-95fafa22ed7c	Teka	standard	t	2026-01-08 00:13:36.746073+00	\N
fc07fb23-2b2f-4316-a0bc-c9730bd9720f	Fagor	standard	t	2026-01-08 00:13:36.746073+00	\N
2581809e-35c9-4919-a2af-9c5aff4503b4	Edesa	budget	t	2026-01-08 00:13:36.746073+00	\N
15a75833-5327-41c7-a124-d35f4f032e91	Zanussi	standard	t	2026-01-08 00:13:36.746073+00	\N
0ef10fa0-951d-42fe-b63b-058e64a97a28	Electrolux	premium	t	2026-01-08 00:13:36.746073+00	\N
df629b78-f95a-44b2-96df-cb4481d0f37a	Miele	premium	t	2026-01-08 00:13:36.746073+00	\N
b64e884f-9430-4cfc-8e47-b96b8b7dc811	Hisense	budget	t	2026-01-08 00:13:36.746073+00	\N
1ec13edc-ce6d-4d4b-9bdd-5e7765af0aad	Haier	standard	t	2026-01-08 00:13:36.746073+00	\N
dca191cd-c12d-474f-93d7-e0431ec9016c	Candy	budget	t	2026-01-08 00:13:36.746073+00	\N
a70af444-952c-439b-b2a9-4a03c4c718ea	Daikin	premium	t	2026-01-08 00:13:36.746073+00	\N
fc2ff183-9cf5-4397-8627-488d4f6ec92f	Fujitsu	standard	t	2026-01-08 00:13:36.746073+00	\N
af5e2cbf-4874-4361-a62f-e0b06fce38f6	Mitsubishi	premium	t	2026-01-08 00:13:36.746073+00	\N
9ae0c500-e13d-4525-885b-a7603244cc33	Carrier	standard	t	2026-01-08 00:13:36.746073+00	\N
668c6e51-2e03-4328-bcc6-eb12b8708df0	Liebherr	premium	t	2026-01-08 00:13:36.746073+00	\N
6d49aa83-6d0e-4c9d-bede-4977e596b1c0	Smeg	premium	t	2026-01-08 00:13:36.746073+00	\N
74cea6e5-6526-47dd-adc5-b57dccdfaa7b	Junkers	standard	t	2026-01-08 00:19:43.186128+00	\N
3718194f-2a26-43eb-b28c-1d8a53dfb0f8	Cointra	standard	t	2026-01-10 19:30:13.694024+00	\N
434c4922-de7d-4ce1-998b-2106178daf36	Viessmann	standard	t	2026-01-10 20:01:31.282108+00	\N
0ed4aecc-cbf4-4734-b998-d1ea12324d20	Jskjdh	standard	f	2026-01-08 00:01:08.836246+00	\N
4f5e4718-fcd4-49e0-bfc9-a2bfe873f71d	AEG	premium	t	2026-01-08 00:13:36.746073+00	https://zapjbtgnmxkhpfykxmnh.supabase.co/storage/v1/object/public/company-asset/brands/4f5e4718-fcd4-49e0-bfc9-a2bfe873f71d-1768171957399.png
758ab250-c688-4c17-acac-c44768df645d	Balay	standard	t	2026-01-08 00:01:08.836246+00	https://zapjbtgnmxkhpfykxmnh.supabase.co/storage/v1/object/public/company-asset/brands/758ab250-c688-4c17-acac-c44768df645d-1768171987167.png
05282aa9-f71c-412a-99e9-11def58c10d2	Beko	budget	t	2026-01-08 00:13:36.746073+00	https://zapjbtgnmxkhpfykxmnh.supabase.co/storage/v1/object/public/company-asset/brands/05282aa9-f71c-412a-99e9-11def58c10d2-1768172027815.png
704e9fc2-1a15-4173-bd3f-ce9a4ba3a2f8	Sime	standard	t	2026-01-19 11:02:57.300031+00	\N
ece275a1-f78c-4ff8-a549-7a842f128026	Gree	standard	t	2026-01-20 18:03:28.775042+00	\N
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.budgets (id, budget_number, client_id, title, description, appliance_info, labor_items, part_items, total_amount, deposit_amount, deposit_percentage_materials, deposit_percentage_labor, payment_terms, status, created_via, created_by, created_at, valid_until, pdf_url, converted_ticket_id) FROM stdin;
\.


--
-- Data for Name: business_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.business_config (id, key, value, updated_at, updated_by, opening_time, closing_time, working_hours) FROM stdin;
5b9093de-e3ff-48ce-bb4b-941e4b9313a4	working_hours	{"friday": {"end": "19:00", "start": "09:00"}, "monday": {"end": "19:00", "start": "09:00", "breaks": [{"end": "15:00", "start": "14:00"}]}, "sunday": {"end": "23:00", "start": "09:00"}, "tuesday": {"end": "19:00", "start": "09:00", "breaks": [{"end": "15:00", "start": "14:00"}]}, "saturday": null, "thursday": {"end": "23:00", "start": "09:00", "breaks": [{"end": "15:00", "start": "14:00"}]}, "wednesday": {"end": "19:00", "start": "09:00", "breaks": [{"end": "15:00", "start": "14:00"}]}}	2026-01-06 23:00:00.315537+00	\N	09:00	19:00	\N
ee1d6232-eb2d-4056-a86c-8d944f94568c	whatsapp_bot_config	{"legal": {"privacy_notice": "", "service_conditions": "📋 Información del Servicio Técnico\\nEstimado cliente, antes de solicitar su cita, queremos informarle con total transparencia de nuestras condiciones:\\n\\nDesplazamiento Gratuito: Entendemos que usted no puede trasladar su electrodoméstico hasta un taller. Por ello, asumimos nosotros el coste logístico y de trayecto. La visita del técnico a su domicilio no tiene coste.\\n\\nDiagnóstico y Presupuesto: El técnico revisará su equipo para ofrecerle una solución. Solo en el caso de que usted decida NO reparar, deberá abonar el servicio de diagnóstico y localización de avería (36,30€ IVA inc.).\\n\\nGarantía de Devolución: Si usted acepta el presupuesto en un plazo de 15 días, dicho importe se le descontará íntegramente del precio final de la reparación."}, "company": {"name": "Fixarr Servicio Técnico", "email": "info@fixarr.es", "phone": "+34633489521"}, "messages": {"goodbye": "Gracias por confiar en {company_name}. ¡Hasta pronto!", "ask_name": "¿A nombre de quién agendamos la cita?", "greeting": "¡Hola! 👋 Bienvenido a {company_name}. Soy tu asistente virtual.", "ask_brand": "¿Cuál es la marca del {appliance}?", "ask_model": "¿Conoces el modelo? (puedes escribir 'no sé')", "ask_phone": "¿Un teléfono de contacto?", "ask_address": "¿Cuál es la dirección donde realizaremos el servicio?", "ask_problem": "Describe brevemente el problema que presenta", "ask_appliance": "¿Qué electrodoméstico necesita reparación?", "confirm_appointment": "Perfecto! Te propongo estas fechas disponibles:", "appointment_confirmed": "¡Cita confirmada! 📅 Te esperamos el {date} a las {time}."}, "settings": {"bot_enabled": true, "working_hours_end": "23:59", "working_hours_start": "00:00", "response_delay_seconds": 2}}	2026-01-25 16:07:37.364916+00	\N	09:00	19:00	\N
\.


--
-- Data for Name: client_addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_addresses (id, client_id, label, address_line, floor, apartment, postal_code, city, latitude, longitude, is_primary, created_at, updated_at, last_used_at, address_order) FROM stdin;
22c5c3ce-4d04-4828-9896-937f80d438c8	5a0123f9-9c32-4255-8415-190a1781d20c	Vivienda Principal	Plaza Santa Maria, 7 3C	\N	\N	29012	Malaga	36.7235510	-4.4155860	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
2f2cba14-fa87-4474-b234-ad3606b9a4df	9f5ab862-c0a7-4268-8d1d-67dfd09a3bbe	Vivienda Principal	Calle Río Verde, 17, Fuengirola, España	1	f	29651	Fuengirola	36.5391750	-4.6427150	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
798e691e-9982-4421-a31e-a096590e4347	8bf4d7b6-804d-43ea-859b-dc14c7e8781a	Vivienda Principal	C/ Lanuza, 63 2º	\N	\N	29009	Malaga	36.7212000	-4.4217000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
cf24a902-99cf-476c-834b-5141ecb8a645	f34e3b75-efef-4fca-94a6-0aa2d56a8559	Vivienda Principal	Calle calañas, 4 9D	\N	\N	\N	\N	\N	\N	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
a4cea7a8-dd03-4276-8152-e85d5d769fd2	372528ae-3801-4630-bf9f-2ea391205dea	Vivienda Principal	C/ Petunia, 1	\N	\N	29730	Rincon de la Victoria	36.7202510	-4.2793020	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
663ac59a-5061-4262-8297-8339978e0fc8	e04c5b1d-f76b-4b78-8e37-726eb0bc842a	Vivienda Principal	C/ Angel Guimera, 2 ptal 3 3B	\N	\N	29017	Malaga	36.7212000	-4.4217000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
7bd193e4-32fc-4889-a6f2-dfed1edf1fec	fe5fac17-3248-467e-859c-760ec9248bcd	Vivienda Principal	Paseo Reding	\N	\N	29016	Malaga	36.7209680	-4.4099150	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
d73f3efa-078d-44cf-ab7f-3bc5e9135e00	15c1c9ad-51ef-4d1b-b2f5-9b1e87f515ce	Vivienda Principal	C/ Ramon Ramos Martin, 9 1º	\N	\N	29010	Malaga	36.7212000	-4.4217000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
56fb78f6-dd4a-408d-8225-f207f50ea9d0	dfb931dc-451b-4b6d-84f8-75b52df3aeee	Vivienda Principal	Urb. Mirador de Santa Maria Golf, 2 1ºA	\N	\N	29603	Marbella	36.5124450	-4.8429450	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
517f2973-de45-4dda-a4ce-02163024573a	67d71093-6f7c-405b-9733-38bff4a602d3	Vivienda Principal	Avd. de las Americas, 3	\N	\N	29002	Malaga	36.7212000	-4.4217000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
6562cdde-3241-4314-a75a-78d0e5454373	0b3527de-9e89-4068-a5f0-4294ec5a4d40	Vivienda Principal	C/ Huescar, 14	\N	\N	29007	Malaga	36.7212000	-4.4217000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
a641443d-3ad3-42dc-8c93-bc1da78e6c47	7c0ed384-4866-4e82-9543-f7552a90a3cb	Vivienda Principal	Carretera de Olias, 48	\N	\N	29018	Málaga	37.0436750	-4.8589650	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
1c05fe75-7782-4564-bfc2-274187f4caad	6c6e41b6-349c-495a-ba74-b807f7aa2899	Vivienda Principal	Calle Río Verde, 17, Fuengirola, España	1	F	29651	Fuengirola	36.5391620	-4.6427100	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
0053dfd0-a8a2-4e6a-8da7-c5ceb99b0c38	043a151e-0859-40d1-9cbf-8ffe2eff90de	Vivienda Principal	Calle Ollerías, 4, Málaga, España	1	2	29012	Málaga	36.7242900	-4.4217120	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
bb8cdf25-d422-46c5-abb8-1837198007c6	48d1ace4-d89f-4911-ac4f-f899e69cd0f3	Vivienda Principal	calle rio frio, 1			29651	Mijas	36.5394250	-4.6426760	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
03ff9987-7970-46ef-8ebe-104e9cd311cb	1735d854-bb86-49c9-a2b9-144a7deb749d	Vivienda Principal	C/ Edward Elgar, 6 esc izq 2ºD	\N	\N	29002	Malaga	36.7092080	-4.4346390	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
a590f134-497c-4aae-9810-778953ce04b1	1178174b-9e6e-421d-ad0f-825ed84d8742	Vivienda Principal	C/ La Orotava, 123	\N	\N	29006	Malaga	36.7015270	-4.4702000	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
d9a10460-60ac-478a-9e4d-6998209b83cf	78aa757c-4d11-4986-8a20-142904280697	Vivienda Principal	C/ Gladiolos, 8	\N	\N	29013	Malaga	36.7384070	-4.4153940	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
1199b777-dfa7-4bbf-91a1-a547f351a499	91fe09c7-8d22-4090-b43f-c1ca8de8cdcd	Vivienda Principal	C/ Nuestra Señora de las Candelas, 29 1J	\N	\N	29004	Malaga	36.6890730	-4.4529700	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
08a40e5a-24a8-4c2a-8871-5e600986f40c	7cb51fc2-25fc-4e20-b22b-57ebe0aa8ca8	Vivienda Principal	Avd. Gregorio Diego, 18	\N	\N	29004	Malaga	36.6906130	-4.4530110	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
c140f009-0688-43d3-8b24-6fa44f4217a3	9aad5b13-6093-45a2-be89-eaf175d0eb59	Vivienda Principal	Plaza de la Hispanidad, 4 bajo	\N	\N	29640	Fuengirola	36.5484640	-4.6235010	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
794ebed9-b801-46b9-967b-0bc1b6434cea	c5b325f0-c25e-44cd-9e0f-43e172fcf3ec	Vivienda Principal	C/ Carreteria, 81 1B	\N	\N	29017	Malaga	36.7132850	-4.3236350	t	2026-01-26 23:07:12.729611+00	2026-01-26 23:07:12.729611+00	2026-01-28 22:22:04.46107+00	1
90118e82-7fae-423a-a880-6e152530c42c	3f0d8266-bc5c-4fa6-ae59-13bb929cc7b6	casa 121	Calle Río Verde, 17, Fuengirola, España	\N	\N	29651	Fuengirola	36.5391755	-4.6427146	t	2026-01-28 23:31:31.973163+00	2026-01-28 23:31:31.973163+00	2026-01-28 23:31:31.973163+00	1
38920a4b-ae82-4420-a444-220fd89101a6	3f0d8266-bc5c-4fa6-ae59-13bb929cc7b6	casa 340	Calle Larios, 23, Málaga, España	\N	\N	29005	Málaga	36.7194661	-4.4215746	f	2026-01-28 23:31:32.072078+00	2026-01-28 23:41:20.329737+00	2026-01-28 23:41:20.329737+00	2
46e0da4c-29b1-4db3-a265-c1b1d4fcdce5	0305764f-c00a-4ff6-bab7-0aac8041657c	Casa	calle rio verde 17	\N	\N	\N	\N	\N	\N	t	2026-01-28 23:49:33.48781+00	2026-01-28 23:49:33.48781+00	2026-01-28 23:49:33.48781+00	1
b986eaa8-b88d-4317-b3f2-030468d93c21	2438dbf8-c2c9-4bc4-adef-049deb5b131b	Casa	calle rio verde 19	\N	\N	\N	\N	\N	\N	t	2026-01-29 00:22:08.002389+00	2026-01-29 00:22:08.002389+00	2026-01-29 00:22:08.002389+00	1
\.


--
-- Data for Name: client_appliances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_appliances (id, client_id, type, brand, model, serial_number, location, photo_url, created_at, updated_at, purchase_date, warranty_expiry, photo_model, photo_location, photo_overview, purchase_year, initial_value_estimate, repair_count, expert_override, expert_note, housing_type, floor_level) FROM stdin;
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (id, company_name, logo_url, primary_color, created_at, company_address, company_phone, company_email, company_tax_id, legal_terms, tax_rate, company_signature_url) FROM stdin;
82f57a40-46c7-4f8e-88b3-3f9efe1bc797	Satialia	https://zapjbtgnmxkhpfykxmnh.supabase.co/storage/v1/object/public/company-asset/logo-1767176099035.png	#2563eb	2025-12-31 09:43:19.44941+00						21	\N
\.


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory (id, name, sku, description, stock_quantity, cost_price, sale_price, warranty_months, created_at) FROM stdin;
\.


--
-- Data for Name: mortify_assessments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mortify_assessments (id, created_at, appliance_id, input_year, input_floor_level, score_brand, score_age, score_installation, score_financial, total_score, ia_suggestion, status, admin_verdict, admin_note, admin_decision_date, admin_recovered_points, updated_at) FROM stdin;
\.


--
-- Data for Name: mortify_brand_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mortify_brand_scores (id, brand_name, score_points, created_at, updated_at) FROM stdin;
ca0a8215-615f-48cb-98ad-4c2778866b3d	AEG	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
3c862347-26f1-4832-b745-af6e4eac3f3e	BALAY	3	2026-01-18 09:23:17.790044+00	2026-01-18 09:23:17.790044+00
39254a84-3392-4480-b319-41f21c161974	BEKO	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
f8f9289e-492d-49fc-8099-defbcb534c89	BOSCH	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
293848c0-d724-4b0f-bf86-fc06d6f3ae88	CANDY	1	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
9cc25c50-324e-4b08-861a-0c9533bab5b8	DAEWOO	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
51705970-919b-4df1-ac90-dfd99aa75613	DAIKIN	2	2026-01-18 22:38:07.83894+00	2026-01-18 22:38:07.83894+00
c419c13b-e76d-45b7-ab52-aad284e6be0a	EDESA	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
e7998841-9698-446d-9be9-230beed4da5e	ELECTROLUX	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
05ab5cf7-9dc0-4008-bc27-a11600a973f5	FAGOR	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
124bd768-7d2d-4594-93f4-b393ead8465c	HAIER	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
d38e7b55-578d-43a6-804c-b41926c891d8	HISENSE	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
1677cce9-3463-4e3a-8616-35e0ac71bd90	HOOVER	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
3361c423-5fa4-4d9e-ae6d-782e2b14bf58	HOTPOINT	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
b8727617-78c9-4c2d-9915-5e0bd1dafa0d	INDESIT	1	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
108598d4-6d5f-4ff9-a8d3-5fdb33efa9b1	LG	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
33db8af6-7586-4368-aee1-3337418834fd	LIEBHERR	4	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
c6668211-99eb-470c-9c30-c400e49c3b95	OTSEIN	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
d1b1325b-e144-4fd9-98b5-a90701c87644	PANASONIC	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
878b3373-64a8-4bba-9eaa-144e21a3eb67	SIEMENS	3	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
6af200a7-b643-4f3c-bdb2-1a26d3dd5466	SMEG	4	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
1b3481ce-a089-42f6-8291-93f50777edd3	TEKA	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
81dd9b68-9d70-4781-bbb5-8ab92ab9c73a	WHIRLPOOL	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
916a13ef-d253-4019-a225-d71adff38d0e	ZANUSSI	2	2026-01-18 10:21:11.912593+00	2026-01-18 10:21:11.912593+00
4ec33ba3-4218-4c0e-b476-7457bda027ae	MIELE	4	2026-01-18 10:07:45.713901+00	2026-01-18 10:07:45.713901+00
084c7cb0-a3c5-4827-9325-8dd6b2f90fd0	SAMSUNG	4	2026-01-17 07:08:50.204972+00	2026-01-17 07:08:50.204972+00
17bfc117-7ab3-425a-8b6b-f0501d0c3862	VIESSMANN	4	2026-01-18 13:48:37.336412+00	2026-01-18 13:48:37.336412+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, user_id, email, full_name, role, avatar_url, phone, address, current_location, is_available, created_at, is_active, province, postal_code, phone_2, created_via, city, floor, apartment, notes, permissions, is_super_admin, deleted_at, dni, friendly_id, current_lat, current_lng, last_location_update, avg_rating, total_reviews, completed_services, street_type, street_name, street_number, contact_email, username, bypass_time_restrictions, status, status_reason, has_mortify, latitude, longitude, client_type, registration_source) FROM stdin;
2438dbf8-c2c9-4bc4-adef-049deb5b131b	\N	rafa@gmail.com	RAFA NADAL	client	\N	635957841	calle rio verde 19	\N	f	2026-01-29 00:22:07.483411+00	t	\N	\N	\N	app	\N	\N	\N	\N	{}	f	\N	\N	144	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	\N	\N	particular	app
812cc4b8-64a9-4c7e-8678-26e112c1643e	\N	amorbuba@fixarr.es	Super Admin	admin	\N	\N	\N	\N	f	2026-01-19 07:37:17.937531+00	t	\N	\N	\N	app	\N	\N	\N	\N	{}	t	\N	\N	43	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	\N	\N	particular	office
8cde3248-4b30-47ae-ae03-36c9e3128a5a	\N	francisco@gmail.com	paco normal	client	\N	655123456	Calle Larios, Málaga, España	\N	f	2026-01-27 22:12:09.8546+00	t	\N	\N	\N	admin	Málaga	2	1	\N	{}	f	\N	\N	141	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.719469	-4.421575	particular	office
5a0123f9-9c32-4255-8415-190a1781d20c	\N	\N	Gonzalo Ruiz Esteban	client	\N	640636474	Plaza Santa Maria, 7 3C	\N	f	2026-01-19 11:03:17.631421+00	t	Málaga	29012	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	106	36.72789186320762	-4.420367605805641	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.723551	-4.415586	particular	office
8bf4d7b6-804d-43ea-859b-dc14c7e8781a	\N	\N	Klaus Walz	client	\N	491708030526	C/ Lanuza, 63 2º	\N	f	2026-01-20 18:03:41.432824+00	t	\N	29009	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	115	36.72924939621337	-4.413635832141551	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.7212	-4.4217	particular	office
372528ae-3801-4630-bf9f-2ea391205dea	\N	\N	Jose Miguel Pomares	client	\N	692757663	C/ Petunia, 1	\N	f	2026-01-20 18:08:04.939088+00	t	Málaga	29730	\N	admin	Rincon de la Victoria	\N	\N	\N	{}	f	\N	\N	118	36.72523764655642	-4.415268501973467	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.720251	-4.279302	particular	office
d0e8beac-6cd4-427c-9aba-f330539a4375	\N	redachaudri@gmail.com	Reda Chaudri Morabet	tech		633489521	Calle rio verde, 17, 29651 Mijas	\N	f	2026-01-19 07:52:03.793533+00	t		29651	\N	app	Mijas	\N	\N	\N	{}	f	\N	09235241M	44	36.53907732109854	-4.642812232697966	2026-01-29 06:33:19.606+00	0.00	0	29	Calle	rio verde	17	redachaudri@gmail.com		t	active	\N	f	\N	\N	particular	office
e04c5b1d-f76b-4b78-8e37-726eb0bc842a	\N	\N	Laura Herrero	client	\N	600407136	C/ Angel Guimera, 2 ptal 3 3B	\N	f	2026-01-20 18:06:49.877222+00	t	\N	29017	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	117	36.725068066433195	-4.4215426561635836	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.7212	-4.4217	particular	office
dfb931dc-451b-4b6d-84f8-75b52df3aeee	\N	\N	Anuska Belier	client	\N	678553845	Urb. Mirador de Santa Maria Golf, 2 1ºA	\N	f	2026-01-20 10:24:19.10802+00	t	Málaga	29603	\N	admin	Marbella	\N	\N	\N	{}	f	\N	\N	114	36.72930224696471	-4.417594117290993	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.512445	-4.842945	particular	office
67d71093-6f7c-405b-9733-38bff4a602d3	\N	\N	Maria Luz	client	\N	654010336	Avd. de las Americas, 3	\N	f	2026-01-19 10:59:18.966578+00	t	\N	29002	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	104	36.7262605019004	-4.416666313385797	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.7212	-4.4217	particular	office
f34e3b75-efef-4fca-94a6-0aa2d56a8559	\N	\N	Luba bella	client	\N	633414025	Calle calañas, 4 9D	\N	f	2026-01-26 20:52:51.92279+00	t	\N	\N	\N	app	\N	\N	\N	\N	{}	f	\N	\N	136	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	\N	\N	particular	office
0b3527de-9e89-4068-a5f0-4294ec5a4d40	\N	\N	Yamila Agraghe	client	\N	650367441	C/ Huescar, 14	\N	f	2026-01-19 11:01:28.493968+00	t	\N	29007	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	105	36.72928185412984	-4.413206950906925	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.7212	-4.4217	particular	office
9f5ab862-c0a7-4268-8d1d-67dfd09a3bbe	\N	redachaudri@gmail.com	reda buba	client	\N	633489764	Calle Río Verde, 17, Fuengirola, España	\N	f	2026-01-24 04:58:23.964199+00	t	Málaga	29651	\N	admin	Fuengirola	1	f	\N	{}	f	\N	\N	123	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.539175	-4.642715	particular	office
043a151e-0859-40d1-9cbf-8ffe2eff90de	\N	nayke-vm@hotmail.com	sergio dalma	client	\N	652452154	Calle Ollerías, 4, Málaga, España	\N	f	2026-01-25 12:45:52.632287+00	t	\N	29012	\N	admin	Málaga	1	2	\N	{}	f	\N	\N	133	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.72429	-4.421712	particular	office
1178174b-9e6e-421d-ad0f-825ed84d8742	\N	\N	Juan Carlos Reinaldo	client	\N	645450078	C/ La Orotava, 123	\N	f	2026-01-20 09:57:58.035902+00	t	Málaga	29006	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	113	36.72123495318384	-4.414411329506537	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.701527	-4.4702	particular	office
78aa757c-4d11-4986-8a20-142904280697	\N	\N	M Dolores Torreblanca	client	\N	722546606	C/ Gladiolos, 8	\N	f	2026-01-20 09:54:53.873767+00	t	Málaga	29013	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	112	36.728414115013564	-4.421419965129477	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.738407	-4.415394	particular	office
91fe09c7-8d22-4090-b43f-c1ca8de8cdcd	\N	\N	Sonia Juarez	client	\N	615826711	C/ Nuestra Señora de las Candelas, 29 1J	\N	f	2026-01-20 09:28:45.240284+00	t	Málaga	29004	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	111	36.726770303058956	-4.415347367353914	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.689073	-4.45297	particular	office
7cb51fc2-25fc-4e20-b22b-57ebe0aa8ca8	\N	\N	Izaskun Malo	client	\N	647696946	Avd. Gregorio Diego, 18	\N	f	2026-01-20 08:56:51.302131+00	t	Málaga	29004	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	110	36.72553215558508	-4.415681438208767	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.690613	-4.453011	particular	office
c5b325f0-c25e-44cd-9e0f-43e172fcf3ec	\N	\N	Federico Aralcibia	client	\N	644150971	C/ Carreteria, 81 1B	\N	f	2026-01-19 14:32:32.131225+00	t	Málaga	29017	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	108	36.72399263717821	-4.4182796163173075	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.713285	-4.323635	particular	office
fe5fac17-3248-467e-859c-760ec9248bcd	\N	\N	Mariano	client	\N	\N	Paseo Reding	\N	f	2026-01-20 18:04:36.539586+00	t	Málaga	29016	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	116	36.72514057085436	-4.413702190233617	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.720968	-4.409915	particular	office
3f0d8266-bc5c-4fa6-ae59-13bb929cc7b6	\N	inmopaz@gmail.com	INMOBILIARIA LA PAZ	client	\N	633489521	Calle Río Verde, 17, Fuengirola, España	\N	f	2026-01-28 22:29:09.11993+00	t	\N	29651	\N	app	Fuengirola	\N	\N	\N	{}	f	\N	\N	142	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.5391755	-4.6427146	professional	app
0305764f-c00a-4ff6-bab7-0aac8041657c	\N	rbnb@gmail.com	rbnb	client	\N	645765321	calle rio verde 17	\N	f	2026-01-28 23:49:32.824343+00	t	\N	\N	\N	app	\N	\N	\N	\N	{}	f	\N	\N	143	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	\N	\N	professional	app
15c1c9ad-51ef-4d1b-b2f5-9b1e87f515ce	\N	\N	Maria Segura	client	\N	639917572951286943	C/ Ramon Ramos Martin, 9 1º	\N	f	2026-01-19 10:57:07.280169+00	t	\N	29010	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	103	36.72704026279345	-4.420430759651635	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.7212	-4.4217	particular	office
9aad5b13-6093-45a2-be89-eaf175d0eb59	\N	\N	Fast Order	client	\N	611154401	Plaza de la Hispanidad, 4 bajo	\N	f	2026-01-19 14:34:40.296696+00	t	Málaga	29640	\N	admin	Fuengirola	\N	\N	\N	{}	f	\N	\N	109	36.725802554695775	-4.416549107845585	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.548464	-4.623501	particular	office
48d1ace4-d89f-4911-ac4f-f899e69cd0f3	\N		paco rabanne	client	\N	65395645	calle rio frio, 1	\N	f	2026-01-23 07:01:08.737345+00	t	Málaga	29651		admin	Mijas				{}	f	\N	\N	122	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.539425	-4.642676	particular	office
1735d854-bb86-49c9-a2b9-144a7deb749d	\N	\N	Dora Fernandez Duran	client	\N	672156209677574032	C/ Edward Elgar, 6 esc izq 2ºD	\N	f	2026-01-20 18:10:00.052239+00	t	Málaga	29002	\N	admin	Malaga	\N	\N	\N	{}	f	\N	\N	119	36.72289448672594	-4.414433810637725	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.709208	-4.434639	particular	office
7c0ed384-4866-4e82-9543-f7552a90a3cb	\N	\N	Colegio Antonio Gutierrez Mata	client	\N	670344574	Carretera de Olias, 48	\N	f	2026-01-19 14:30:52.211837+00	t	Málaga	29018	\N	admin	Málaga	\N	\N	\N	{}	f	\N	\N	107	36.721439749666175	-4.4158503889930705	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	37.043675	-4.858965	particular	office
6c6e41b6-349c-495a-ba74-b807f7aa2899	\N		michael jackson	client	\N	655599252	Calle Río Verde, 17, Fuengirola, España	\N	f	2026-01-24 08:53:55.843622+00	t	Granada	29651		admin	Fuengirola	1	F		{}	f	\N	\N	124	\N	\N	\N	0.00	0	0	\N	\N	\N	\N	\N	f	active	\N	f	36.539162	-4.64271	particular	office
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, ticket_id, technician_id, client_id, rating, badges, comment, created_at) FROM stdin;
\.


--
-- Data for Name: service_catalog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_catalog (id, name, base_price, active, created_at) FROM stdin;
ea901e36-17ec-4ff0-9f70-46220590d0d9	Rearme y ajuste de piezas 	65	t	2026-01-21 07:12:10.963805+00
\.


--
-- Data for Name: service_parts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_parts (id, ticket_id, inventory_id, quantity, unit_price_at_time, created_at) FROM stdin;
\.


--
-- Data for Name: service_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_types (id, name, estimated_duration_min, buffer_time_min, color_code, is_active, created_at) FROM stdin;
f1f701f2-d9d3-414e-87d7-059f93bc12c0	Diagnóstico / Revisión	60	30	#3B82F6	t	2026-01-06 23:00:00.315537+00
578a5293-847c-404f-a178-069367d5020a	Reparación Estándar	90	30	#10B981	t	2026-01-06 23:00:00.315537+00
8662749d-ed29-422b-9900-304264c4d5a3	Instalación Aire Acondicionado	240	45	#8B5CF6	t	2026-01-06 23:00:00.315537+00
213db443-518e-4cc6-9155-f9610075ab95	Instalación Caldera	180	45	#F59E0B	t	2026-01-06 23:00:00.315537+00
54cf7f46-0740-4263-bbab-1ca03f4499af	Mantenimiento Preventivo	60	15	#6366F1	t	2026-01-06 23:00:00.315537+00
\.


--
-- Data for Name: service_zones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_zones (id, province, cities, is_active, created_at) FROM stdin;
d9e2fdb8-cca5-440d-91e7-f516c4c0b519	Málaga	{Málaga,Marbella,Mijas,Fuengirola,Vélez-Málaga,Torremolinos,Benalmádena,Estepona,"Rincón de la Victoria",Antequera,"Alhaurín de la Torre",Ronda,Cártama,"Alhaurín el Grande",Coín,Nerja,Torrox,Manilva,Álora}	t	2026-01-24 07:28:59.315128+00
6a9f86bd-8a3d-4a7a-89ba-38cb83f7e768	Granada	{Granada,Motril,Almuñécar,Armilla,Maracena,Loja,Baza,"Las Gabias","La Zubia",Guadix}	t	2026-01-24 07:28:59.315128+00
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: supabase_admin
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: technician_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.technician_locations (technician_id, latitude, longitude, heading, speed, updated_at) FROM stdin;
d0e8beac-6cd4-427c-9aba-f330539a4375	36.53902292855189	-4.6428054696653875	0	0	2026-01-24 09:02:06.827+00
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, ticket_number, client_id, technician_id, appliance_info, status, description_failure, diagnosis_notes, labor_cost, parts_total, total_price, scheduled_at, completed_at, created_at, ai_diagnosis, pdf_url, pdf_sent_to_client, created_by, tech_diagnosis, tech_solution, parts_list, labor_list, deposit_amount, is_paid, payment_method, payment_proof_url, pdf_generated_at, appointment_status, client_feedback, proposed_slots, appliance_id, quote_generated_at, status_history, quote_pdf_url, payment_deposit, payment_terms, origin_source, created_via, total_amount, estimated_duration, required_parts_description, material_status_at, deposit_receipt_url, material_ordered, material_supplier, service_type_id, scheduled_end_at, brand_id, cancellation_reason, final_price, is_warranty, original_ticket_id, warranty_until, warranty_labor_until, warranty_parts_until, warranty_labor_months, warranty_parts_months, updated_at, link_ticket_id, warranty_pdf_url, material_ordered_by, material_received_by, material_received, material_deposit_pdf_url, pdf_sent_at, pdf_sent_via, pdf_sent_to, reminder_sent, departure_notification_sent, address_id) FROM stdin;
b968da29-d60c-4b2f-9e41-4bdc6f6aa7e3	102	3f0d8266-bc5c-4fa6-ae59-13bb929cc7b6	d0e8beac-6cd4-427c-9aba-f330539a4375	{"type": "Lavadora", "brand": "AEG", "model": ""}	asignado	sadhkshkj	\N	0.00	0.00	0.00	2026-01-29 09:30:00+00	\N	2026-01-28 23:41:20.329737+00		\N	f	812cc4b8-64a9-4c7e-8678-26e112c1643e	\N	\N	[]	[]	0	f	\N	\N	\N	confirmed	\N	[]	\N	\N	[]	\N	0.00	\N	direct	manual	0.00	60	\N	\N	\N	f	\N	f1f701f2-d9d3-414e-87d7-059f93bc12c0	2026-01-29 10:30:00+00	4f5e4718-fcd4-49e0-bfc9-a2bfe873f71d	\N	\N	f	\N	\N	\N	\N	3	24	2026-01-28 23:41:29.631387+00	\N	\N	\N	\N	f	\N	\N	\N	\N	f	f	38920a4b-ae82-4420-a444-220fd89101a6
\.


--
-- Data for Name: warranties; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warranties (id, ticket_id, start_date, end_date, pdf_url, created_at) FROM stdin;
\.


--
-- Data for Name: whatsapp_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_conversations (id, phone, current_step, collected_data, created_at, updated_at, expires_at, message_count) FROM stdin;
5a68440b-7309-4e6d-8d8c-c7c6fae96f9c	+16315551181	ask_brand	{"appliance": "this is a text message"}	2026-01-25 19:59:00.992622+00	2026-01-25 20:01:55.252804+00	2026-01-26 20:01:55.13+00	2
fd87ec18-9232-4ab9-ae2d-90da93080363	+34633332584	ask_appliance	{}	2026-01-25 21:28:48.338823+00	2026-01-25 21:28:48.469843+00	2026-01-26 21:28:48.397+00	1
2cf9001a-ef79-4f25-9cf2-6548a4044230	+34633414025	ask_appliance	{"name": "Luba bella", "client_identity": {"client": {"id": "f34e3b75-efef-4fca-94a6-0aa2d56a8559", "email": null, "phone": "+34633414025", "address": "Calle calañas, 4 9D", "full_name": "Luba bella"}, "exists": true, "addresses": [{"id": "cf24a902-99cf-476c-834b-5141ecb8a645", "city": null, "floor": null, "label": "Vivienda Principal", "latitude": null, "apartment": null, "client_id": "f34e3b75-efef-4fca-94a6-0aa2d56a8559", "longitude": null, "created_at": "2026-01-26T23:07:12.729611+00:00", "is_primary": true, "updated_at": "2026-01-26T23:07:12.729611+00:00", "postal_code": null, "address_line": "Calle calañas, 4 9D"}]}}	2026-01-28 20:55:52.088964+00	2026-01-28 20:55:52.542465+00	2026-01-29 20:55:52.462+00	1
\.


--
-- Name: budgets_budget_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.budgets_budget_number_seq', 1, false);


--
-- Name: profiles_friendly_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_friendly_id_seq', 144, true);


--
-- Name: tickets_ticket_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tickets_ticket_number_seq', 102, true);


--
-- Name: appliance_category_defaults appliance_category_defaults_category_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliance_category_defaults
    ADD CONSTRAINT appliance_category_defaults_category_name_key UNIQUE (category_name);


--
-- Name: appliance_category_defaults appliance_category_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliance_category_defaults
    ADD CONSTRAINT appliance_category_defaults_pkey PRIMARY KEY (id);


--
-- Name: appliance_types appliance_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliance_types
    ADD CONSTRAINT appliance_types_name_key UNIQUE (name);


--
-- Name: appliance_types appliance_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliance_types
    ADD CONSTRAINT appliance_types_pkey PRIMARY KEY (id);


--
-- Name: appliances appliances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliances
    ADD CONSTRAINT appliances_pkey PRIMARY KEY (id);


--
-- Name: brands brands_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_key UNIQUE (name);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: business_config business_config_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_config
    ADD CONSTRAINT business_config_key_key UNIQUE (key);


--
-- Name: business_config business_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_config
    ADD CONSTRAINT business_config_pkey PRIMARY KEY (id);


--
-- Name: client_addresses client_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_addresses
    ADD CONSTRAINT client_addresses_pkey PRIMARY KEY (id);


--
-- Name: client_appliances client_appliances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_appliances
    ADD CONSTRAINT client_appliances_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_sku_key UNIQUE (sku);


--
-- Name: mortify_assessments mortify_assessments_appliance_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_assessments
    ADD CONSTRAINT mortify_assessments_appliance_id_key UNIQUE (appliance_id);


--
-- Name: mortify_assessments mortify_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_assessments
    ADD CONSTRAINT mortify_assessments_pkey PRIMARY KEY (id);


--
-- Name: mortify_brand_scores mortify_brand_scores_brand_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_brand_scores
    ADD CONSTRAINT mortify_brand_scores_brand_name_key UNIQUE (brand_name);


--
-- Name: mortify_brand_scores mortify_brand_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_brand_scores
    ADD CONSTRAINT mortify_brand_scores_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_dni_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_dni_key UNIQUE (dni);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_ticket_id_key UNIQUE (ticket_id);


--
-- Name: service_catalog service_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_catalog
    ADD CONSTRAINT service_catalog_pkey PRIMARY KEY (id);


--
-- Name: service_parts service_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_parts
    ADD CONSTRAINT service_parts_pkey PRIMARY KEY (id);


--
-- Name: service_types service_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_name_key UNIQUE (name);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: service_zones service_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_zones
    ADD CONSTRAINT service_zones_pkey PRIMARY KEY (id);


--
-- Name: technician_locations technician_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technician_locations
    ADD CONSTRAINT technician_locations_pkey PRIMARY KEY (technician_id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: mortify_brand_scores unique_brand_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_brand_scores
    ADD CONSTRAINT unique_brand_name UNIQUE (brand_name);


--
-- Name: warranties warranties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warranties
    ADD CONSTRAINT warranties_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_phone_key UNIQUE (phone);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: idx_addresses_last_used; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_last_used ON public.client_addresses USING btree (client_id, last_used_at DESC);


--
-- Name: idx_appliances_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appliances_address ON public.appliances USING btree (address_id);


--
-- Name: idx_appliances_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appliances_client ON public.appliances USING btree (client_id);


--
-- Name: idx_appliances_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appliances_type ON public.appliances USING btree (type);


--
-- Name: idx_budgets_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_budgets_client ON public.budgets USING btree (client_id);


--
-- Name: idx_budgets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_budgets_status ON public.budgets USING btree (status);


--
-- Name: idx_client_addresses_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_addresses_client_id ON public.client_addresses USING btree (client_id);


--
-- Name: idx_client_addresses_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_client_addresses_primary ON public.client_addresses USING btree (client_id) WHERE (is_primary = true);


--
-- Name: idx_conversations_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_expires ON public.whatsapp_conversations USING btree (expires_at);


--
-- Name: idx_conversations_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_phone ON public.whatsapp_conversations USING btree (phone);


--
-- Name: idx_conversations_step; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_step ON public.whatsapp_conversations USING btree (current_step);


--
-- Name: idx_mortify_appliance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mortify_appliance ON public.mortify_assessments USING btree (appliance_id);


--
-- Name: idx_mortify_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mortify_status ON public.mortify_assessments USING btree (status);


--
-- Name: idx_tickets_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_address ON public.tickets USING btree (address_id);


--
-- Name: idx_tickets_appliance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_appliance_id ON public.tickets USING btree (appliance_id);


--
-- Name: idx_tickets_original_ticket_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_original_ticket_id ON public.tickets USING btree (original_ticket_id);


--
-- Name: idx_tickets_pdf_sent_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_pdf_sent_at ON public.tickets USING btree (pdf_sent_at);


--
-- Name: idx_tickets_warranty_until; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_warranty_until ON public.tickets USING btree (warranty_until);


--
-- Name: client_appliances auto_harvest_brand; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER auto_harvest_brand BEFORE INSERT OR UPDATE ON public.client_appliances FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_harvest_brand();


--
-- Name: reviews on_review_created; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_review_created AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_technician_stats();


--
-- Name: tickets on_ticket_completed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_ticket_completed AFTER UPDATE ON public.tickets FOR EACH ROW WHEN (((new.status = 'finalizado'::public.ticket_status) AND (old.status <> 'finalizado'::public.ticket_status))) EXECUTE FUNCTION public.increment_completed_services();


--
-- Name: tickets trg_calculate_end_time; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_calculate_end_time BEFORE INSERT OR UPDATE OF scheduled_at, estimated_duration ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.calculate_ticket_end_time();


--
-- Name: tickets trg_check_tech_overlap; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_check_tech_overlap BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.check_tech_overlap();


--
-- Name: mortify_assessments trg_mortify_insert_recalc; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_mortify_insert_recalc AFTER INSERT ON public.mortify_assessments FOR EACH ROW EXECUTE FUNCTION public.trigger_mortify_insert_recalc();


--
-- Name: tickets trg_mortify_reopen_on_ticket; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_mortify_reopen_on_ticket AFTER UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.trigger_reopen_mortify_on_ticket();


--
-- Name: tickets trg_mortify_v13_tickets; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_mortify_v13_tickets AFTER UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.trigger_mortify_v13_god_tier();


--
-- Name: client_addresses trigger_auto_address_order; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_auto_address_order BEFORE INSERT ON public.client_addresses FOR EACH ROW WHEN (((new.address_order IS NULL) OR (new.address_order = 1))) EXECUTE FUNCTION public.auto_assign_address_order();


--
-- Name: profiles trigger_normalize_phone_profiles; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_normalize_phone_profiles BEFORE INSERT OR UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_before_save();


--
-- Name: tickets trigger_update_address_usage; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_address_usage AFTER INSERT ON public.tickets FOR EACH ROW WHEN ((new.address_id IS NOT NULL)) EXECUTE FUNCTION public.update_address_last_used();


--
-- Name: client_addresses trigger_update_client_address; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_client_address BEFORE UPDATE ON public.client_addresses FOR EACH ROW EXECUTE FUNCTION public.update_client_address_timestamp();


--
-- Name: whatsapp_conversations trigger_update_conversation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_conversation BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();


--
-- Name: reviews trigger_update_tech_stats; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_tech_stats AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_technician_stats();


--
-- Name: client_addresses trigger_validate_address_limit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_validate_address_limit BEFORE INSERT ON public.client_addresses FOR EACH ROW EXECUTE FUNCTION public.validate_address_limit();


--
-- Name: tickets update_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: appliances appliances_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliances
    ADD CONSTRAINT appliances_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.client_addresses(id) ON DELETE SET NULL;


--
-- Name: appliances appliances_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appliances
    ADD CONSTRAINT appliances_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: budgets budgets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


--
-- Name: budgets budgets_converted_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_converted_ticket_id_fkey FOREIGN KEY (converted_ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: budgets budgets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: business_config business_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_config
    ADD CONSTRAINT business_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: client_addresses client_addresses_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_addresses
    ADD CONSTRAINT client_addresses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_appliances client_appliances_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_appliances
    ADD CONSTRAINT client_appliances_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mortify_assessments mortify_assessments_appliance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mortify_assessments
    ADD CONSTRAINT mortify_assessments_appliance_id_fkey FOREIGN KEY (appliance_id) REFERENCES public.client_appliances(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


--
-- Name: reviews reviews_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id);


--
-- Name: reviews reviews_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: service_parts service_parts_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_parts
    ADD CONSTRAINT service_parts_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id);


--
-- Name: service_parts service_parts_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_parts
    ADD CONSTRAINT service_parts_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: technician_locations technician_locations_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technician_locations
    ADD CONSTRAINT technician_locations_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.client_addresses(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_appliance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_appliance_id_fkey FOREIGN KEY (appliance_id) REFERENCES public.client_appliances(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: tickets tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


--
-- Name: tickets tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_link_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_link_ticket_id_fkey FOREIGN KEY (link_ticket_id) REFERENCES public.tickets(id);


--
-- Name: tickets tickets_material_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_material_ordered_by_fkey FOREIGN KEY (material_ordered_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_material_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_material_received_by_fkey FOREIGN KEY (material_received_by) REFERENCES auth.users(id);


--
-- Name: tickets tickets_original_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_original_ticket_id_fkey FOREIGN KEY (original_ticket_id) REFERENCES public.tickets(id);


--
-- Name: tickets tickets_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id);


--
-- Name: tickets tickets_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id);


--
-- Name: warranties warranties_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warranties
    ADD CONSTRAINT warranties_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: client_appliances Admin All Open; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin All Open" ON public.client_appliances FOR SELECT TO authenticated USING (true);


--
-- Name: inventory Admin Gestiona Inventario; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin Gestiona Inventario" ON public.inventory USING ((public.am_i_role('admin'::text) AND public.have_permission('can_manage_inventory'::text)));


--
-- Name: tickets Admin view all tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin view all tickets" ON public.tickets FOR SELECT TO authenticated USING (true);


--
-- Name: mortify_brand_scores Admins can do everything on brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can do everything on brands" ON public.mortify_brand_scores USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: appliance_category_defaults Admins can edit category defaults; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can edit category defaults" ON public.appliance_category_defaults USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: appliance_types Admins can manage appliance types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage appliance types" ON public.appliance_types USING ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE ((profiles.role)::text = ANY (ARRAY['admin'::text, 'super_admin'::text, 'technician'::text])))));


--
-- Name: profiles Admins can update client profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update client profiles" ON public.profiles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = 'admin'::public.user_role))))) WITH CHECK (((role = 'client'::public.user_role) OR (auth.uid() = id)));


--
-- Name: client_appliances Admins can view all client_appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all client_appliances" ON public.client_appliances FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: company_settings Admins insert settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins insert settings" ON public.company_settings FOR INSERT WITH CHECK (public.am_i_role('admin'::text));


--
-- Name: company_settings Admins update settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins update settings" ON public.company_settings FOR UPDATE USING (public.am_i_role('admin'::text));


--
-- Name: mortify_brand_scores Allow Authenticated Read Brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow Authenticated Read Brands" ON public.mortify_brand_scores FOR SELECT TO authenticated USING (true);


--
-- Name: mortify_brand_scores Allow Public Read Brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow Public Read Brands" ON public.mortify_brand_scores FOR SELECT TO anon USING (true);


--
-- Name: business_config Allow read access to authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow read access to authenticated users" ON public.business_config FOR SELECT TO authenticated USING (true);


--
-- Name: business_config Allow update access to authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow update access to authenticated users" ON public.business_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: client_addresses Authenticated users can delete addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete addresses" ON public.client_addresses FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: appliances Authenticated users can delete appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can delete appliances" ON public.appliances FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: client_addresses Authenticated users can insert addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert addresses" ON public.client_addresses FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: appliances Authenticated users can insert appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert appliances" ON public.appliances FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: client_addresses Authenticated users can update addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update addresses" ON public.client_addresses FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: appliances Authenticated users can update appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update appliances" ON public.appliances FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: client_addresses Authenticated users can view addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view addresses" ON public.client_addresses FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: appliances Authenticated users can view appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view appliances" ON public.appliances FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: technician_locations Authenticated users view locations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users view locations" ON public.technician_locations FOR SELECT TO authenticated USING (true);


--
-- Name: tickets Client Self Read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Client Self Read" ON public.tickets FOR SELECT USING ((auth.uid() = client_id));


--
-- Name: reviews Clients can create reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can create reviews" ON public.reviews FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text)));


--
-- Name: tickets Clients can create their own tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can create their own tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = client_id));


--
-- Name: client_appliances Clients can delete own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can delete own appliances" ON public.client_appliances FOR DELETE USING ((auth.uid() = client_id));


--
-- Name: client_appliances Clients can insert own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can insert own appliances" ON public.client_appliances FOR INSERT WITH CHECK ((auth.uid() = client_id));


--
-- Name: tickets Clients can update appointment status; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can update appointment status" ON public.tickets FOR UPDATE TO authenticated USING ((auth.uid() = client_id)) WITH CHECK ((auth.uid() = client_id));


--
-- Name: client_appliances Clients can update own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can update own appliances" ON public.client_appliances FOR UPDATE USING ((auth.uid() = client_id));


--
-- Name: client_appliances Clients can view own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients can view own appliances" ON public.client_appliances FOR SELECT USING ((auth.uid() = client_id));


--
-- Name: tickets Clients create tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients create tickets" ON public.tickets FOR INSERT WITH CHECK ((auth.uid() = client_id));


--
-- Name: tickets Clients view own tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clients view own tickets" ON public.tickets FOR SELECT USING ((auth.uid() = client_id));


--
-- Name: budgets Enable all for authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated" ON public.budgets TO authenticated USING (true) WITH CHECK (true);


--
-- Name: mortify_assessments Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users" ON public.mortify_assessments FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: mortify_assessments Enable read access for all authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all authenticated users" ON public.mortify_assessments FOR SELECT TO authenticated USING (true);


--
-- Name: appliance_category_defaults Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.appliance_category_defaults FOR SELECT USING (true);


--
-- Name: mortify_brand_scores Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.mortify_brand_scores FOR SELECT USING (true);


--
-- Name: service_catalog Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.service_catalog FOR SELECT USING (true);


--
-- Name: mortify_assessments Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authenticated users" ON public.mortify_assessments FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: service_zones Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authenticated users" ON public.service_zones FOR SELECT TO authenticated USING (true);


--
-- Name: mortify_assessments Enable read for own assessments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read for own assessments" ON public.mortify_assessments FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: mortify_assessments Enable select for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for authenticated users" ON public.mortify_assessments FOR SELECT TO authenticated USING (true);


--
-- Name: mortify_assessments Enable update for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable update for authenticated users" ON public.mortify_assessments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: service_catalog Enable write access for admins only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable write access for admins only" ON public.service_catalog USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::public.user_role)))));


--
-- Name: appliance_types Everyone can read appliance types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Everyone can read appliance types" ON public.appliance_types FOR SELECT USING (true);


--
-- Name: tickets Master Admin Tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Master Admin Tickets" ON public.tickets USING (public.is_admin());


--
-- Name: mortify_brand_scores Public can view brand scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view brand scores" ON public.mortify_brand_scores FOR SELECT USING (true);


--
-- Name: brands Public read brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read brands" ON public.brands FOR SELECT TO authenticated USING (true);


--
-- Name: company_settings Public read settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read settings" ON public.company_settings FOR SELECT USING (true);


--
-- Name: reviews Reviews are public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reviews are public read" ON public.reviews FOR SELECT USING (true);


--
-- Name: service_parts See parts involved; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "See parts involved" ON public.service_parts FOR SELECT USING ((ticket_id IN ( SELECT tickets.id
   FROM public.tickets
  WHERE ((tickets.client_id = auth.uid()) OR (tickets.technician_id = auth.uid()) OR (public.get_my_role() = 'admin'::public.user_role)))));


--
-- Name: client_addresses Service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access" ON public.client_addresses USING (true) WITH CHECK (true);


--
-- Name: whatsapp_conversations Service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access" ON public.whatsapp_conversations USING (true) WITH CHECK (true);


--
-- Name: technician_locations Technicians update own location; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Technicians update own location" ON public.technician_locations USING ((auth.uid() = technician_id));


--
-- Name: service_parts Techs add parts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Techs add parts" ON public.service_parts FOR INSERT WITH CHECK ((ticket_id IN ( SELECT tickets.id
   FROM public.tickets
  WHERE (tickets.technician_id = auth.uid()))));


--
-- Name: tickets Techs update assigned tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Techs update assigned tickets" ON public.tickets FOR UPDATE USING ((technician_id = auth.uid()));


--
-- Name: tickets Techs view assigned tickets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Techs view assigned tickets" ON public.tickets FOR SELECT USING (((technician_id = auth.uid()) OR ((technician_id IS NULL) AND (public.get_my_role() = 'tech'::public.user_role))));


--
-- Name: inventory Techs view inventory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Techs view inventory" ON public.inventory FOR SELECT USING ((public.get_my_role() = 'tech'::public.user_role));


--
-- Name: inventory Tecnico Lee Inventario; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tecnico Lee Inventario" ON public.inventory FOR SELECT USING (public.am_i_role('tech'::text));


--
-- Name: client_appliances Users can read own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own appliances" ON public.client_appliances FOR SELECT USING ((auth.uid() = client_id));


--
-- Name: client_appliances Users can view own appliances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own appliances" ON public.client_appliances FOR SELECT USING ((auth.uid() = client_id));


--
-- Name: mortify_assessments Users can view own assessments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own assessments" ON public.mortify_assessments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.client_appliances
  WHERE ((client_appliances.id = mortify_assessments.appliance_id) AND (client_appliances.client_id = auth.uid())))));


--
-- Name: profiles anon_check_phone_exists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY anon_check_phone_exists ON public.profiles FOR SELECT TO anon USING (true);


--
-- Name: appliance_category_defaults; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.appliance_category_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: appliance_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.appliance_types ENABLE ROW LEVEL SECURITY;

--
-- Name: appliances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: client_addresses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: mortify_brand_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.mortify_brand_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_clients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_delete_clients ON public.profiles FOR DELETE TO authenticated USING ((role = 'client'::public.user_role));


--
-- Name: profiles profiles_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_delete_own ON public.profiles FOR DELETE TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles profiles_insert_any; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_insert_any ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: service_catalog; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: service_parts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.service_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: service_zones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: technician_locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: warranties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION am_i_role(target_role_text text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.am_i_role(target_role_text text) TO anon;
GRANT ALL ON FUNCTION public.am_i_role(target_role_text text) TO authenticated;
GRANT ALL ON FUNCTION public.am_i_role(target_role_text text) TO service_role;


--
-- Name: FUNCTION auto_assign_address_order(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.auto_assign_address_order() TO anon;
GRANT ALL ON FUNCTION public.auto_assign_address_order() TO authenticated;
GRANT ALL ON FUNCTION public.auto_assign_address_order() TO service_role;


--
-- Name: FUNCTION calculate_ticket_end_time(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calculate_ticket_end_time() TO anon;
GRANT ALL ON FUNCTION public.calculate_ticket_end_time() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_ticket_end_time() TO service_role;


--
-- Name: FUNCTION check_tech_overlap(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_tech_overlap() TO anon;
GRANT ALL ON FUNCTION public.check_tech_overlap() TO authenticated;
GRANT ALL ON FUNCTION public.check_tech_overlap() TO service_role;


--
-- Name: FUNCTION cleanup_expired_conversations(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.cleanup_expired_conversations() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_conversations() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_conversations() TO service_role;


--
-- Name: FUNCTION fn_calculate_mortify_score(p_appliance_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_calculate_mortify_score(p_appliance_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_calculate_mortify_score(p_appliance_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_calculate_mortify_score(p_appliance_id uuid) TO service_role;


--
-- Name: FUNCTION fn_clear_mortify_history(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_clear_mortify_history() TO anon;
GRANT ALL ON FUNCTION public.fn_clear_mortify_history() TO authenticated;
GRANT ALL ON FUNCTION public.fn_clear_mortify_history() TO service_role;


--
-- Name: FUNCTION fn_get_appliance_financial_limit(p_appliance_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_get_appliance_financial_limit(p_appliance_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_get_appliance_financial_limit(p_appliance_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_get_appliance_financial_limit(p_appliance_id uuid) TO service_role;


--
-- Name: FUNCTION get_analytics_kpis(start_date date, end_date date); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_analytics_kpis(start_date date, end_date date) TO anon;
GRANT ALL ON FUNCTION public.get_analytics_kpis(start_date date, end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_analytics_kpis(start_date date, end_date date) TO service_role;


--
-- Name: FUNCTION get_analytics_v2(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_analytics_v2(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_analytics_v2(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_analytics_v2(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO service_role;


--
-- Name: FUNCTION get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[], p_zone_cps text[], p_appliance_types text[], p_brand_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[], p_zone_cps text[], p_appliance_types text[], p_brand_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[], p_zone_cps text[], p_appliance_types text[], p_brand_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_analytics_v3(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_ids uuid[], p_zone_cps text[], p_appliance_types text[], p_brand_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_business_intelligence(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_business_intelligence(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_business_intelligence(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_business_intelligence(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tech_id uuid, p_zone_cp text, p_appliance_type text, p_brand_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_my_role() TO anon;
GRANT ALL ON FUNCTION public.get_my_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;


--
-- Name: FUNCTION get_tech_availability(target_date date, duration_minutes integer, target_cp text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_tech_availability(target_date date, duration_minutes integer, target_cp text) TO anon;
GRANT ALL ON FUNCTION public.get_tech_availability(target_date date, duration_minutes integer, target_cp text) TO authenticated;
GRANT ALL ON FUNCTION public.get_tech_availability(target_date date, duration_minutes integer, target_cp text) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION have_permission(perm_key text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.have_permission(perm_key text) TO anon;
GRANT ALL ON FUNCTION public.have_permission(perm_key text) TO authenticated;
GRANT ALL ON FUNCTION public.have_permission(perm_key text) TO service_role;


--
-- Name: FUNCTION increment_completed_services(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.increment_completed_services() TO anon;
GRANT ALL ON FUNCTION public.increment_completed_services() TO authenticated;
GRANT ALL ON FUNCTION public.increment_completed_services() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION manage_brand(brand_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.manage_brand(brand_name text) TO anon;
GRANT ALL ON FUNCTION public.manage_brand(brand_name text) TO authenticated;
GRANT ALL ON FUNCTION public.manage_brand(brand_name text) TO service_role;


--
-- Name: FUNCTION merge_clients(source_id uuid, target_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.merge_clients(source_id uuid, target_id uuid) TO anon;
GRANT ALL ON FUNCTION public.merge_clients(source_id uuid, target_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.merge_clients(source_id uuid, target_id uuid) TO service_role;


--
-- Name: FUNCTION normalize_phone(phone text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.normalize_phone(phone text) TO anon;
GRANT ALL ON FUNCTION public.normalize_phone(phone text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_phone(phone text) TO service_role;


--
-- Name: FUNCTION normalize_phone_before_save(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.normalize_phone_before_save() TO anon;
GRANT ALL ON FUNCTION public.normalize_phone_before_save() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_phone_before_save() TO service_role;


--
-- Name: FUNCTION trigger_auto_harvest_brand(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_auto_harvest_brand() TO anon;
GRANT ALL ON FUNCTION public.trigger_auto_harvest_brand() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_auto_harvest_brand() TO service_role;


--
-- Name: FUNCTION trigger_auto_mortify_on_close(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_auto_mortify_on_close() TO anon;
GRANT ALL ON FUNCTION public.trigger_auto_mortify_on_close() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_auto_mortify_on_close() TO service_role;


--
-- Name: FUNCTION trigger_mortify_insert_recalc(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_mortify_insert_recalc() TO anon;
GRANT ALL ON FUNCTION public.trigger_mortify_insert_recalc() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_mortify_insert_recalc() TO service_role;


--
-- Name: FUNCTION trigger_mortify_v13_god_tier(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_mortify_v13_god_tier() TO anon;
GRANT ALL ON FUNCTION public.trigger_mortify_v13_god_tier() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_mortify_v13_god_tier() TO service_role;


--
-- Name: FUNCTION trigger_reopen_mortify_on_ticket(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_reopen_mortify_on_ticket() TO anon;
GRANT ALL ON FUNCTION public.trigger_reopen_mortify_on_ticket() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_reopen_mortify_on_ticket() TO service_role;


--
-- Name: FUNCTION update_address_last_used(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_address_last_used() TO anon;
GRANT ALL ON FUNCTION public.update_address_last_used() TO authenticated;
GRANT ALL ON FUNCTION public.update_address_last_used() TO service_role;


--
-- Name: FUNCTION update_client_address_timestamp(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_client_address_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_client_address_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_client_address_timestamp() TO service_role;


--
-- Name: FUNCTION update_conversation_timestamp(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_conversation_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_conversation_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_conversation_timestamp() TO service_role;


--
-- Name: FUNCTION update_technician_stats(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_technician_stats() TO anon;
GRANT ALL ON FUNCTION public.update_technician_stats() TO authenticated;
GRANT ALL ON FUNCTION public.update_technician_stats() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION validate_address_limit(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.validate_address_limit() TO anon;
GRANT ALL ON FUNCTION public.validate_address_limit() TO authenticated;
GRANT ALL ON FUNCTION public.validate_address_limit() TO service_role;


--
-- Name: TABLE appliance_category_defaults; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.appliance_category_defaults TO anon;
GRANT ALL ON TABLE public.appliance_category_defaults TO authenticated;
GRANT ALL ON TABLE public.appliance_category_defaults TO service_role;


--
-- Name: TABLE appliance_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.appliance_types TO anon;
GRANT ALL ON TABLE public.appliance_types TO authenticated;
GRANT ALL ON TABLE public.appliance_types TO service_role;


--
-- Name: TABLE appliances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.appliances TO anon;
GRANT ALL ON TABLE public.appliances TO authenticated;
GRANT ALL ON TABLE public.appliances TO service_role;


--
-- Name: TABLE brands; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.brands TO anon;
GRANT ALL ON TABLE public.brands TO authenticated;
GRANT ALL ON TABLE public.brands TO service_role;


--
-- Name: TABLE budgets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.budgets TO anon;
GRANT ALL ON TABLE public.budgets TO authenticated;
GRANT ALL ON TABLE public.budgets TO service_role;


--
-- Name: SEQUENCE budgets_budget_number_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.budgets_budget_number_seq TO anon;
GRANT ALL ON SEQUENCE public.budgets_budget_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.budgets_budget_number_seq TO service_role;


--
-- Name: TABLE business_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.business_config TO anon;
GRANT ALL ON TABLE public.business_config TO authenticated;
GRANT ALL ON TABLE public.business_config TO service_role;


--
-- Name: TABLE client_addresses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_addresses TO anon;
GRANT ALL ON TABLE public.client_addresses TO authenticated;
GRANT ALL ON TABLE public.client_addresses TO service_role;


--
-- Name: TABLE client_appliances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_appliances TO anon;
GRANT ALL ON TABLE public.client_appliances TO authenticated;
GRANT ALL ON TABLE public.client_appliances TO service_role;


--
-- Name: TABLE company_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.company_settings TO anon;
GRANT ALL ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO service_role;


--
-- Name: TABLE inventory; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory TO anon;
GRANT ALL ON TABLE public.inventory TO authenticated;
GRANT ALL ON TABLE public.inventory TO service_role;


--
-- Name: TABLE mortify_assessments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.mortify_assessments TO anon;
GRANT ALL ON TABLE public.mortify_assessments TO authenticated;
GRANT ALL ON TABLE public.mortify_assessments TO service_role;


--
-- Name: TABLE mortify_brand_scores; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.mortify_brand_scores TO anon;
GRANT ALL ON TABLE public.mortify_brand_scores TO authenticated;
GRANT ALL ON TABLE public.mortify_brand_scores TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: SEQUENCE profiles_friendly_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.profiles_friendly_id_seq TO anon;
GRANT ALL ON SEQUENCE public.profiles_friendly_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.profiles_friendly_id_seq TO service_role;


--
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reviews TO anon;
GRANT ALL ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;


--
-- Name: TABLE service_catalog; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.service_catalog TO anon;
GRANT ALL ON TABLE public.service_catalog TO authenticated;
GRANT ALL ON TABLE public.service_catalog TO service_role;


--
-- Name: TABLE service_parts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.service_parts TO anon;
GRANT ALL ON TABLE public.service_parts TO authenticated;
GRANT ALL ON TABLE public.service_parts TO service_role;


--
-- Name: TABLE service_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.service_types TO anon;
GRANT ALL ON TABLE public.service_types TO authenticated;
GRANT ALL ON TABLE public.service_types TO service_role;


--
-- Name: TABLE service_zones; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.service_zones TO anon;
GRANT ALL ON TABLE public.service_zones TO authenticated;
GRANT ALL ON TABLE public.service_zones TO service_role;


--
-- Name: TABLE technician_locations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.technician_locations TO anon;
GRANT ALL ON TABLE public.technician_locations TO authenticated;
GRANT ALL ON TABLE public.technician_locations TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: SEQUENCE tickets_ticket_number_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tickets_ticket_number_seq TO anon;
GRANT ALL ON SEQUENCE public.tickets_ticket_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tickets_ticket_number_seq TO service_role;


--
-- Name: TABLE v_duplicate_phones; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_duplicate_phones TO anon;
GRANT ALL ON TABLE public.v_duplicate_phones TO authenticated;
GRANT ALL ON TABLE public.v_duplicate_phones TO service_role;


--
-- Name: TABLE warranties; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.warranties TO anon;
GRANT ALL ON TABLE public.warranties TO authenticated;
GRANT ALL ON TABLE public.warranties TO service_role;


--
-- Name: TABLE whatsapp_conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whatsapp_conversations TO anon;
GRANT ALL ON TABLE public.whatsapp_conversations TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversations TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict Pg1c6ZO1bDFM60RqEWc4orlItQas9OFIcnRYZSywZgZLKKN1b83acaLFJ7CuRSq

