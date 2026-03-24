-- ============================================================
-- Store Signal — Migration 013: AI Chat Agent
-- conversations, messages, agent_context_cache
-- ============================================================

-- ── Conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_tenant_id_idx ON public.conversations(tenant_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: members can select"
  ON public.conversations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations: members can insert"
  ON public.conversations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations: members can update"
  ON public.conversations FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations: members can delete"
  ON public.conversations FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role              text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content           text        NOT NULL,
  tool_calls        jsonb,
  tool_results      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_tenant_id_idx ON public.messages(tenant_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: members can select"
  ON public.messages FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "messages: members can insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Agent Context Cache ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_context_cache (
  tenant_id       uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  context         jsonb       NOT NULL,
  calculated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_context_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_context_cache: members can select"
  ON public.agent_context_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );
