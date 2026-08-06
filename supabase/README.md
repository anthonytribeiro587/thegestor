# Supabase — thegestor

Esta pasta contém a estrutura inicial do banco de dados e as regras de acesso do thegestor.

## 1. Aplicar a migration

No projeto Supabase do thegestor:

1. Abra **SQL Editor**.
2. Crie uma nova query.
3. Copie todo o conteúdo de `migrations/20260806120000_initial_schema_and_rls.sql`.
4. Execute uma única vez.

A migration cria:

- `empresas`
- `usuarios_empresa`
- `clientes`
- `planos`
- `planos_precos`
- `assinaturas`
- `cobrancas`
- `cobrancas_financeiras`
- `pagamentos`
- `tarefas_operacionais`
- `integracoes`
- `mensagens_whatsapp`
- `audit_logs`
- view segura `fila_operacional`

Todas as tabelas expostas possuem RLS habilitado e o papel `anon` não recebe acesso às tabelas do produto.

## 2. Perfis da aplicação

### admin

Pode administrar empresa, clientes, planos, cobranças, valores, integrações e usuários.

### operador

Pode consultar os dados operacionais da empresa e a fila de trabalho, sem acesso às tabelas financeiras. Pode concluir tarefas operacionais, mas um trigger impede alterações em campos administrativos.

Os valores monetários foram separados propositalmente:

- `planos`: dados operacionais do plano, sem preço.
- `planos_precos`: valores; somente admin.
- `cobrancas`: vencimento/status, sem valor.
- `cobrancas_financeiras`: valores da cobrança; somente admin.
- `pagamentos`: dados técnicos/financeiros; somente admin/backend.

O painel do operador deve consumir preferencialmente `public.fila_operacional`, que não contém valores financeiros.

## 3. Primeiro administrador

A migration disponibiliza a RPC `public.criar_empresa` para fazer o onboarding com segurança. Ela só funciona para um usuário autenticado e cria a empresa + vínculo `admin` na mesma operação.

Quando a conexão do Next.js com Supabase estiver pronta, o fluxo inicial será:

```ts
const { data: empresaId, error } = await supabase.rpc('criar_empresa', {
  p_nome: 'thegestor',
  p_slug: 'thegestor',
  p_nome_exibicao: 'Administrador',
})
```

Não é necessário inserir manualmente o usuário de Auth em `usuarios_empresa` se o onboarding usar essa RPC.

## 4. Automação já preparada

Quando `cobrancas.status_pagamento` muda para `pago`, o trigger `cobrancas_criar_tarefa_apos_pagamento` cria automaticamente uma tarefa:

- cliente com status `pendente` -> `novo_cliente`
- demais clientes -> `renovar`

Isso será usado futuramente pelo webhook do Mercado Pago.

## 5. Segredos

Nunca grave Access Token do Mercado Pago, API Key da Evolution ou `service_role` em tabelas acessíveis pelo navegador.

`integracoes.secret_ref` existe apenas para guardar uma referência a um segredo mantido no servidor/Vault. As credenciais reais serão configuradas no ambiente de backend/Vercel na etapa de integrações.
