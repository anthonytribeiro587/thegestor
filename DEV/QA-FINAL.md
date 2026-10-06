# QA final do TheGestor — 2026-10-06

## Ambiente

- Repositório: `anthonytribeiro587/thegestor`
- Branch: `feat/finalizacao-saas`
- Commit/Preview auditado antes da correção de contraste: `c572facea238b8f48fc83e8a2d389b92fbb82480` (`thegestor-5enq0sujm-anthontr587s-projects.vercel.app`)
- Ambiente: Preview Vercel protegido, acessado com link temporário de QA; build local de produção usado para retestar após a correção de contraste.
- Browser: Chromium for Testing `153.0.8010.12`; Playwright `1.63.0`. Instalação temporária de QA, sem dependência adicionada ao projeto.
- Viewports: `1440x900`, `1280x800`, `768x1024`, `390x844`.
- Screenshots: 12 capturas do build local de produção após a correção, em `.qa/screenshots/` (pasta ignorada pelo Git e fora do build).
- Nenhuma credencial de usuário de teste estava disponível. Nenhuma conta foi criada; nenhum dado, pagamento, renovação ou integração foi alterado.

## PASS

- `/`, `/login` e `/cadastro` responderam HTTP 200 nos quatro viewports (12 combinações) no Preview da branch/commit informado.
- Nas 12 combinações: sem overflow horizontal do documento, erros de console/JavaScript, hydration warning, respostas HTTP 4xx/5xx ou requests com falha.
- Links `Recursos`, `Como funciona`, `Segurança`, `FAQ` e `Produto` apontam para seções existentes. CTAs de login e cadastro apontam para as rotas corretas.
- Menu móvel abriu e mostrou as seis opções de navegação. Navegação de landing para cadastro/login e entre abas de autenticação foi exercitada em Chromium.
- Formulários: labels associados, campos obrigatórios, `type=email`, `minLength=8` nas senhas e confirmação nativa de campo vazio observados. Tab alcançou os links/controles em ordem e o foco teve outline visível.
- Inspeção visual das capturas confirmou alinhamento dos painéis, títulos legíveis, cards e CTAs nos tamanhos desktop e mobile.
- Contraste após correção: texto auxiliar e aba inativa de auth ficaram em 4,76:1; labels 10,02:1; texto de CTA 5,12:1. Hero, FAQ e CTA público também passaram nas amostras medidas.
- Build local de produção da branch, após o ajuste de contraste: rotas públicas testadas novamente sem erros de console, hydration ou rede. O Preview auditado antecede esse ajuste.
- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; 26 páginas/rotas geradas.
- `git diff --check` — passou.

## WARN

- Foi encontrado contraste de 4,36:1 em texto auxiliar e aba inativa de auth. Corrigido localmente em `src/app/globals.css` (`--muted` de `#6b7a91` para `#64748b`) e retestado no build local de produção: 4,76:1. O Preview Vercel auditado ainda é o deployment anterior ao ajuste; o novo CSS precisa chegar ao próximo Preview para inspeção pós-deploy.
- Somente no servidor local `next dev`, cinco navegações a `/login` ou `/cadastro` reportaram hydration mismatch para `style={{caret-color:"transparent"}}` nos inputs. O atributo não aparece no HTML servido nem no código-fonte pesquisado. O aviso não ocorreu no Preview Vercel nem no build local de produção. Sem reprodução fora do modo dev, a origem exata permanece indeterminada; acompanhar se voltar a ocorrer em Preview/produção.
- O Preview foi auditado sem usuário Supabase autenticado; aparência após autenticação não está coberta por este resultado.

## FAIL

- Nenhum achado permanece em FAIL após a correção localizada de contraste e a repetição do cenário em Chromium.

## BLOCKED

- Sem sessão/usuário de QA, ficaram sem execução visual e funcional `/inicio`, `/clientes`, `/cobrancas`, `/planos`, `/automacoes`, `/integracoes` e `/configuracoes`.
- Consequentemente, filtros, combinações, paginação, back/forward, ordenação, popover de vencimento, ações seguras, estado de automações, tabs/status/segredos de integrações e campos de configurações não foram validados no browser.
- Não foi possível validar separação ADMIN/OPERADOR ou ações em dados de teste. Nenhuma credencial foi solicitada ou inventada.
- As migrations operacionais continuam sem execução em banco de staging; este QA não valida schema/RPCs aplicados.

## Conclusão

**NOT READY FOR MAIN.** A auditoria pública em Chromium passou no Preview original e foi repetida no build local de produção após a correção de contraste; os gates de código passaram. Bloqueadores para aprovação global: falta QA autenticado com usuários de teste ADMIN/OPERADOR e validar migrations/PgTAP em staging. O CSS corrigido aguarda novo Preview. Não foi feito merge na `main`.
