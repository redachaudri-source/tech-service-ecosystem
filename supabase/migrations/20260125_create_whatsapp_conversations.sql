-- ============================================================================
-- TABLA: whatsapp_conversations
-- Almacena el estado de cada conversación activa con un cliente
-- Fase 2: Bot WhatsApp Conversacional
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificador único: número de teléfono normalizado
  phone VARCHAR(20) NOT NULL UNIQUE,
  
  -- Estado actual de la conversación (máquina de estados)
  current_step VARCHAR(50) NOT NULL DEFAULT 'greeting',
  
  -- Datos recolectados durante la conversación (JSON flexible)
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Metadatos
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Auto-expiración: conversaciones abandonadas se limpian
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  
  -- Contador de mensajes (para analytics)
  message_count INTEGER NOT NULL DEFAULT 0
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON whatsapp_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_step ON whatsapp_conversations(current_step);
CREATE INDEX IF NOT EXISTS idx_conversations_expires ON whatsapp_conversations(expires_at);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.message_count = COALESCE(OLD.message_count, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation ON whatsapp_conversations;
CREATE TRIGGER trigger_update_conversation
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- RLS: Solo el service_role puede acceder (Edge Functions)
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON whatsapp_conversations;
CREATE POLICY "Service role full access" ON whatsapp_conversations
  FOR ALL USING (true) WITH CHECK (true);

-- Función para limpiar conversaciones expiradas (ejecutar con cron)
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM whatsapp_conversations WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comentarios descriptivos
COMMENT ON TABLE whatsapp_conversations IS 'Almacena el estado de conversaciones activas del bot WhatsApp';
COMMENT ON COLUMN whatsapp_conversations.current_step IS 'Estado actual: greeting, ask_appliance, ask_brand, ask_model, ask_problem, ask_address, ask_name, ask_phone, create_ticket';
COMMENT ON COLUMN whatsapp_conversations.collected_data IS 'Datos recolectados: {appliance, brand, model, problem, address, name, phone}';
