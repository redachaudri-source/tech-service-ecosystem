-- SAFE SQL: Ensure 'APP_PAYMENT' exists in payment_method enum or check constraint
DO $$
BEGIN
    -- 1. Try adding to ENUM type if it exists
    BEGIN
        ALTER TYPE public.payment_method ADD VALUE 'APP_PAYMENT';
    EXCEPTION
        WHEN duplicate_object THEN null; -- Already exists
        WHEN undefined_object THEN null; -- Type doesn't exist
    END;

    -- 2. Try adding to ticket_status enum if needed (just in case)
    BEGIN
        ALTER TYPE public.ticket_status ADD VALUE 'PENDING_PAYMENT';
    EXCEPTION
        WHEN duplicate_object THEN null;
        WHEN undefined_object THEN null;
    END;
END $$;
