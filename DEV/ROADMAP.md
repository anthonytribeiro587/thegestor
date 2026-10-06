# Roadmap

## Entregue no código

- [x] Cadastro, visualização, edição, cancelamento e reativação de clientes.
- [x] Gestão administrativa de planos: criação, edição, ativação, preço atual e histórico preservado.
- [x] Seleção do catálogo ativo nos formulários, mantendo compatibilidade com clientes antigos.
- [x] Paginação server-side de clientes e cobranças, com busca, filtros, vencimento e contadores agregados.
- [x] Dashboard com métricas completas agregadas no banco e listas limitadas.
- [x] Geração mensal de cobranças, atualização de vencidas e deduplicação por assinatura/competência.
- [x] Pagamento manual, renovação por modalidades e movimentação idempotente de créditos.
- [x] Evolution/WhatsApp configurável, Vault, histórico, templates, deduplicação e limite diário com reserva atômica.
- [x] Mercado Pago/Pix por cobrança, referência externa, webhook e baixa idempotente no código.
- [x] Remoção da configuração duplicada de automações na tela de Integrações.
- [x] Estados de carregamento/erro principais e revisão de mensagens desatualizadas.

## Pendências antes de declarar prontidão de produção

- [ ] Aplicar e validar as migrations desta branch em staging/produção com backup e plano de rollback.
- [ ] Validar visualmente desktop/mobile e percorrer fluxos reais com contas ADMIN e OPERATOR.
- [ ] Confirmar credenciais e webhooks Mercado Pago no ambiente comercial, inclusive notificações e reconciliação real.
- [ ] Confirmar Evolution/Vault, cron de billing e cron de WhatsApp em execução no ambiente alvo.
- [ ] E2E de cliente → cobrança → pagamento → renovação e testes de integração Supabase/RLS.
- [ ] Definir política de retentativa manual de mensagens sem quebrar deduplicação ou causar envio duplicado.
- [ ] Instrumentação de observabilidade e alertas operacionais.

## Notas

O roadmap anterior estava desatualizado: os blocos de billing, Evolution/WhatsApp e Mercado Pago já tinham implementações no código. A existência de rotas e migrations não comprova credenciais, cron, webhook nem comportamento em produção; esses itens permanecem sujeitos a validação no ambiente.
