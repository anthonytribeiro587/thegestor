-- thegestor | usuarios reais, perfis e convites
-- Execute depois das migrations anteriores.

begin;

create table if not exists public.convites_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  nome_exibicao text,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'cancelado')),
  convidado_por uuid references auth.users(id) on delete set null,
  aceito_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '14 days'),
  aceito_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create unique index if not exists convites_empresa_email_pendente_idx
  on public.convites_empresa (empresa_id, lower(email))
  where status = 'pendente';

create index if not exists convites_empresa_email_idx
  on public.convites_empresa (lower(email), status, expira_em);

create trigger convites_empresa_set_updated_at
before update on public.convites_empresa
for each row execute function private.set_updated_at();

alter table public.convites_empresa enable row level security;
revoke all on table public.convites_empresa from anon, authenticated;
grant select, insert, update on public.convites_empresa to authenticated;

create policy convites_select_admin on public.convites_empresa
for select to authenticated
using ((select private.e_admin(empresa_id)));

create policy convites_insert_admin on public.convites_empresa
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy convites_update_admin on public.convites_empresa
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Lista membros reais com o e-mail mantido no Supabase Auth.
create or replace function public.listar_usuarios_empresa(p_empresa_id uuid)
returns table (
  vinculo_id uuid,
  user_id uuid,
  nome_exibicao text,
  email text,
  papel text,
  ativo boolean,
  criado_em timestamptz,
  ultimo_login_em timestamptz,
  e_usuario_atual boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem listar usuarios' using errcode = '42501';
  end if;

  return query
  select
    ue.id,
    ue.user_id,
    coalesce(nullif(ue.nome_exibicao, ''), split_part(u.email, '@', 1)),
    u.email::text,
    ue.papel,
    ue.ativo,
    ue.criado_em,
    u.last_sign_in_at,
    ue.user_id = auth.uid()
  from public.usuarios_empresa ue
  join auth.users u on u.id = ue.user_id
  where ue.empresa_id = p_empresa_id
  order by
    case when ue.user_id = auth.uid() then 0 else 1 end,
    ue.ativo desc,
    ue.criado_em asc;
end;
$$;

revoke all on function public.listar_usuarios_empresa(uuid) from public, anon;
grant execute on function public.listar_usuarios_empresa(uuid) to authenticated;

-- Cria convite interno. O usuário convidado entra/cria conta usando este mesmo e-mail.
create or replace function public.convidar_usuario_empresa(
  p_empresa_id uuid,
  p_email text,
  p_papel text default 'operador',
  p_nome_exibicao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_existing_user uuid;
  v_invite_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem convidar usuarios' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'E-mail invalido';
  end if;

  if p_papel not in ('admin', 'operador') then
    raise exception 'Perfil invalido';
  end if;

  select u.id into v_existing_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing_user is not null and exists (
    select 1 from public.usuarios_empresa ue
    where ue.empresa_id = p_empresa_id and ue.user_id = v_existing_user
  ) then
    raise exception 'Este usuario ja pertence a empresa';
  end if;

  update public.convites_empresa
    set status = 'cancelado', atualizado_em = now()
  where empresa_id = p_empresa_id
    and lower(email) = v_email
    and status = 'pendente';

  insert into public.convites_empresa (
    empresa_id, email, nome_exibicao, papel, status, convidado_por
  ) values (
    p_empresa_id,
    v_email,
    nullif(trim(coalesce(p_nome_exibicao, '')), ''),
    p_papel,
    'pendente',
    auth.uid()
  ) returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.convidar_usuario_empresa(uuid, text, text, text) from public, anon;
grant execute on function public.convidar_usuario_empresa(uuid, text, text, text) to authenticated;

-- Usuário autenticado aceita automaticamente convite pendente do próprio e-mail.
create or replace function public.aceitar_convite_pendente()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_convite public.convites_empresa%rowtype;
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    return jsonb_build_object('aceito', false);
  end if;

  select c.* into v_convite
  from public.convites_empresa c
  where lower(c.email) = v_email
    and c.status = 'pendente'
    and c.expira_em > now()
  order by c.criado_em desc
  limit 1;

  if v_convite.id is null then
    return jsonb_build_object('aceito', false);
  end if;

  insert into public.usuarios_empresa (
    empresa_id, user_id, nome_exibicao, papel, ativo
  ) values (
    v_convite.empresa_id,
    v_user_id,
    coalesce(v_convite.nome_exibicao, split_part(v_email, '@', 1)),
    v_convite.papel,
    true
  )
  on conflict (empresa_id, user_id) do update
    set nome_exibicao = coalesce(excluded.nome_exibicao, public.usuarios_empresa.nome_exibicao),
        papel = excluded.papel,
        ativo = true,
        atualizado_em = now();

  update public.convites_empresa
    set status = 'aceito', aceito_por = v_user_id, aceito_em = now(), atualizado_em = now()
  where id = v_convite.id;

  return jsonb_build_object(
    'aceito', true,
    'empresa_id', v_convite.empresa_id,
    'papel', v_convite.papel
  );
end;
$$;

revoke all on function public.aceitar_convite_pendente() from public, anon;
grant execute on function public.aceitar_convite_pendente() to authenticated;

-- Altera papel/estado sem permitir lockout administrativo.
create or replace function public.atualizar_acesso_usuario(
  p_empresa_id uuid,
  p_vinculo_id uuid,
  p_papel text,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.usuarios_empresa%rowtype;
  v_admins_ativos integer;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem alterar acessos' using errcode = '42501';
  end if;

  if p_papel not in ('admin', 'operador') then
    raise exception 'Perfil invalido';
  end if;

  select * into v_target
  from public.usuarios_empresa
  where id = p_vinculo_id and empresa_id = p_empresa_id;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'Voce nao pode alterar o proprio acesso por esta tela';
  end if;

  if v_target.papel = 'admin' and v_target.ativo = true
     and (p_papel <> 'admin' or p_ativo = false) then
    select count(*) into v_admins_ativos
    from public.usuarios_empresa ue
    where ue.empresa_id = p_empresa_id
      and ue.papel = 'admin'
      and ue.ativo = true;

    if v_admins_ativos <= 1 then
      raise exception 'A empresa precisa manter pelo menos um administrador ativo';
    end if;
  end if;

  update public.usuarios_empresa
    set papel = p_papel,
        ativo = p_ativo,
        atualizado_em = now()
  where id = p_vinculo_id;

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'usuario.acesso_atualizado',
    'usuario_empresa',
    p_vinculo_id,
    jsonb_build_object('papel', p_papel, 'ativo', p_ativo)
  );
end;
$$;

revoke all on function public.atualizar_acesso_usuario(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.atualizar_acesso_usuario(uuid, uuid, text, boolean) to authenticated;

commit;
