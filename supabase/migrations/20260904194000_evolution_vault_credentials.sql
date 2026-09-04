-- thegestor | credenciais Evolution via Supabase Vault
-- O segredo permanece criptografado no Vault. Esta RPC é somente server-side.

begin;

create or replace function public.get_server_evolution_credentials()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ds.decrypted_secret::jsonb
      from vault.decrypted_secrets ds
      where ds.name = 'thegestor_evolution_nextlead'
      order by ds.created_at desc
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.get_server_evolution_credentials() from public;
revoke all on function public.get_server_evolution_credentials() from anon;
revoke all on function public.get_server_evolution_credentials() from authenticated;
grant execute on function public.get_server_evolution_credentials() to service_role;

notify pgrst, 'reload schema';

commit;
