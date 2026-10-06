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
- Catálogo administrativo de planos e preços com histórico preservado.
- Paginação server-side de clientes e cobranças; métricas completas do Dashboard agregadas no banco.
- Evolution/WhatsApp com configuração, Vault, histórico, limite diário e deduplicação.
- Mercado Pago/Pix por cobrança, webhook e baixa automática implementados no código; credenciais e operação real ainda precisam de validação no ambiente comercial.
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
- [x] Visualizar/editar/cancelar/reativar clientes.
- [x] Gestão própria de planos e preços com histórico.
- [x] Paginação server-side de clientes e cobranças.
- [x] Dashboard com consultas agregadas e listas limitadas.

### Mercado Pago

- [ ] Conectar conta Mercado Pago.
- [x] Gerar Pix individual por cobrança e reutilizar tentativa/chave idempotente.
- [x] `external_reference` vinculado à cobrança.
- [x] Webhook com validação e tratamento idempotente no código.
- [x] Baixa automática do pagamento no código.
- [ ] Validar credenciais, notificações e reconciliação no ambiente comercial.
- [ ] Link público para novos clientes.

### Automação de cobranças

- [x] Gerar próximas cobranças automaticamente com deduplicação.
- [x] Atualizar vencidas de forma agendada.
- [x] Lembretes antes/no/após vencimento configuráveis.
- [x] Interromper automação após pagamento.
- [ ] Validar crons e execução em produção.

### WhatsApp

- [x] Conectar Evolution API por instância, credencial via Vault.
- [x] QR/status da conexão.
- [x] Templates, histórico, deduplicação e limite diário.
- [ ] Validar conexão e envio real em produção; definir retentativa manual segura.
- [ ] Camada desacoplada para futura Cloud API.

### Qualidade e segurança

- [x] Testes unitários de Auth, cobrança, importação e XLSX.
- [x] TypeScript obrigatório antes do build.
- [ ] Testes de integração Supabase/RLS.
- [ ] E2E cliente → cobrança → pagamento → renovação.
- [ ] Testes de webhook Mercado Pago.
- [ ] Rate limiting e observabilidade.
- [ ] Testes E2E visuais e validação final ADMIN/OPERATOR em staging.

## Segurança

- Credenciais nunca são versionadas.
- O operador não recebe colunas financeiras pela Data API.
- RLS protege as tabelas de negócio.
- A planilha de clientes não é armazenada no GitHub.
- Integrações devem guardar segredos apenas no servidor/Vault.
- A presença de código para integrações não equivale à validação de credenciais ou execução em produção.
