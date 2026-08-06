-- thegestor | verificacao estrutural apos aplicar a migration

-- 1) Tabelas esperadas + RLS
select
  c.relname as tabela,
  c.relrowsecurity as rls_habilitado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'empresas',
    'usuarios_empresa',
    'clientes',
    'planos',
    'planos_precos',
    'assinaturas',
    'cobrancas',
    'cobrancas_financeiras',
    'pagamentos',
    'tarefas_operacionais',
    'integracoes',
    'mensagens_whatsapp',
    'audit_logs'
  )
order by c.relname;

-- Esperado: 13 linhas e rls_habilitado = true em todas.

-- 2) Politicas RLS criadas
select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'empresas',
    'usuarios_empresa',
    'clientes',
    'planos',
    'planos_precos',
    'assinaturas',
    'cobrancas',
    'cobrancas_financeiras',
    'pagamentos',
    'tarefas_operacionais',
    'integracoes',
    'mensagens_whatsapp',
    'audit_logs'
  )
order by tablename, policyname;

-- 3) Confirmar que anon nao recebeu grants nas tabelas do produto
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'empresas',
    'usuarios_empresa',
    'clientes',
    'planos',
    'planos_precos',
    'assinaturas',
    'cobrancas',
    'cobrancas_financeiras',
    'pagamentos',
    'tarefas_operacionais',
    'integracoes',
    'mensagens_whatsapp',
    'audit_logs'
  );

-- Esperado: zero linhas.

-- 4) View segura do operador
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fila_operacional'
order by ordinal_position;

-- Esperado: nenhuma coluna monetaria (valor, preco, taxa, desconto etc.).
