-- thegestor | automacao WhatsApp de cobrancas
-- Regras ficam desligadas por padrao. O cron envia no maximo uma mensagem por tipo/cobranca.

begin;

alter table public.configuracoes_empresa
  add column if not exists whatsapp_limite_diario integer not null default 30,
  add column if not exists whatsapp_mensagem_antes text not null default 'Olá, {nome}. Passando para lembrar que sua mensalidade vence em {vencimento}.{pagamento}',
  add column if not exists whatsapp_mensagem_vencimento text not null default 'Olá, {nome}. Sua mensalidade vence hoje ({vencimento}).{pagamento}',
  add column if not exists whatsapp_mensagem_atraso text not null default 'Olá, {nome}. Identificamos que sua mensalidade com vencimento em {vencimento} ainda está pendente.{pagamento} Se você já realizou o pagamento, desconsidere esta mensagem.';

alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_lembrete_antes_dias_chk,
  add constraint configuracoes_empresa_lembrete_antes_dias_chk
    check (lembrete_antes_dias between 0 and 30),
  drop constraint if exists configuracoes_empresa_lembrete_atraso_dias_chk,
  add constraint configuracoes_empresa_lembrete_atraso_dias_chk
    check (lembrete_atraso_dias between 0 and 30),
  drop constraint if exists configuracoes_empresa_whatsapp_limite_diario_chk,
  add constraint configuracoes_empresa_whatsapp_limite_diario_chk
    check (whatsapp_limite_diario between 1 and 100);

create index if not exists mensagens_cobranca_status_criado_idx
  on public.mensagens_cobranca(status, criado_em desc);

-- Admin pode editar somente configuracoes da propria empresa pelas policies existentes.
-- Mensagens continuam somente leitura para o admin; escrita fica no backend com secret key.

notify pgrst, 'reload schema';

commit;
