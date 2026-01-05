-- Create Budgets Table for Admin-generated Quotes
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_number SERIAL, -- Independent counter (P-1, P-2...)
    client_id UUID REFERENCES profiles(id),
    
    -- Content
    title TEXT DEFAULT 'Presupuesto de Reparación',
    description TEXT,
    appliance_info JSONB,
    labor_items JSONB DEFAULT '[]',
    part_items JSONB DEFAULT '[]',
    
    -- Financials
    total_amount NUMERIC(10,2) DEFAULT 0,
    deposit_amount NUMERIC(10,2) DEFAULT 0,
    deposit_percentage_materials INTEGER DEFAULT 100,
    deposit_percentage_labor INTEGER DEFAULT 0,
    payment_terms TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected, expired
    
    -- Metadata
    created_via TEXT DEFAULT 'admin_panel',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 days'),
    
    -- Files
    pdf_url TEXT,
    
    -- Relations
    converted_ticket_id UUID REFERENCES tickets(id) -- If accepted, link to the created ticket
);

-- RLS Policies (Simplified for now)
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated" ON budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_budgets_client ON budgets(client_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
