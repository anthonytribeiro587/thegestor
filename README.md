# thegestor

SaaS administrativo para gestão de clientes, cobranças recorrentes e operação de renovações.

## Estado atual

A aplicação está conectada ao Supabase e publicada na Vercel, com dados reais e RLS por perfil.

### Implementado

- Autenticação Supabase por e-mail e senha.
- Criação automática da empresa e do primeiro administrador.
- Banco multiempresa com RLS.
- Administrador e operador com acessos reais.
- Convites internos e vínculo automático de usuários à empresa.
- Separação física dos dados financeiros para impedir acesso do operador.
- Dashboard, clientes, cobranças e fila operacional com dados reais.
- Cadastro manual de cliente + assinatura + cobrança.
- Telefone opcional.
- Importação administrativa de planilha XLSX sem versionar dados de clientes.
- Normalização de observações e progresso de mensalidades, como `2/3`.
- Controle de créditos utilizados e previstos.
- Custo médio por crédito configurável, com padrão de R$ 8,00.
- Projeção mensal de custo dos créditos no Dashboard.
- Ao concluir renovação, créditos previstos passam para utilizados de forma atômica.
- Operador pode ver quantidade de créditos da tarefa, mas nunca valores financeiros.
- Auditoria básica.
- Estrutura preparada para Mercado Pago e WhatsApp/Evolution.
- Layout responsivo desktop, tablet e mobile.
- Testes e TypeScript executados automaticamente antes de cada build.

## Stack

- Next.js App Router
- React + TypeScript
- Supabase Auth + PostgreSQL + RLS
- Vercel
- Lucide Icons
- Vitest

## Qualidade

`npm run build` executa:

1. `npm run lint` (`tsc --noEmit`)
2. `npm test` (`vitest run`)
3. `next build`

O deploy é bloqueado caso tipos ou regras testadas quebrem.

## Importação de clientes

O importador aceita `.xlsx`, lê o arquivo temporariamente no servidor e não salva a planilha no repositório. Antes da gravação, mostra uma prévia com clientes, créditos utilizados/previstos, valores negociados, pagos e a receber.

A importação atual reconhece:

- `2/3`, `3/3` etc. como progresso de mensalidades;
- observações entre parênteses;
- anotações como `Até 10/08`;
- clientes sem telefone;
- créditos utilizados e previstos separados do status de pagamento.

## Roadmap

### Base operacional

- [x] Auth e empresa.
- [x] RLS admin/operador.
- [x] Clientes, cobranças e Dashboard reais.
- [x] Usuários e convites reais.
- [x] Fila operacional sem financeiro.
- [x] Créditos e custo médio por crédito.
- [x] Importação XLSX.
- [ ] Visualizar/editar/cancelar/reativar clientes.
- [ ] Gestão própria de planos e preços.
- [ ] Paginação server-side.

### Mercado Pago

- [ ] Conectar conta Mercado Pago.
- [ ] Gerar PIX individual por cobrança.
- [ ] `external_reference` vinculado à cobrança.
- [ ] Webhook assinado e idempotente.
- [ ] Baixa automática do pagamento.
- [ ] Reconciliação de pagamentos.
- [ ] Link público para novos clientes.

### Automação de cobranças

- [ ] Gerar próximas cobranças automaticamente.
- [ ] Atualizar vencidas de forma agendada.
- [ ] Lembrete antes/no/após vencimento.
- [ ] Parar cobrança automaticamente após pagamento.

### WhatsApp

- [ ] Conectar Evolution API por instância.
- [ ] QR/status da conexão.
- [ ] Templates e histórico de mensagens.
- [ ] Retentativas controladas.
- [ ] Camada desacoplada para futura Cloud API.

### Qualidade e segurança

- [x] Testes unitários de Auth, cobrança, importação e XLSX.
- [x] TypeScript obrigatório antes do build.
- [ ] Testes de integração Supabase/RLS.
- [ ] E2E cliente → cobrança → pagamento → renovação.
- [ ] Testes de webhook Mercado Pago.
- [ ] Rate limiting e observabilidade.

## Segurança

- Credenciais nunca são versionadas.
- O operador não recebe colunas financeiras pela Data API.
- RLS protege as tabelas de negócio.
- A planilha de clientes não é armazenada no GitHub.
- Integrações devem guardar segredos apenas no servidor/Vault.
