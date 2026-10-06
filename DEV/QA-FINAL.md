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

## MOBILE QA — 2026-10-06

### Ambiente e resultados

- Build: produção local (`npm run build`), sem dados de cliente.
- Browser: Chromium for Testing `153.0.8010.12`; Playwright `1.63.0`.
- Viewports: `390x844`, `430x932`, `768x1024`, `1280x800`, `1440x900`.
- Páginas públicas: `/`, `/login`, `/cadastro`, 15 combinações no total.
- Nas 15 combinações: HTTP 200, `scrollWidth` igual à largura do viewport, nenhum elemento visível fora dos limites, sem erro de console ou resposta de rede 4xx/5xx.
- Inspeção visual em 390px: landing com headline reduzida a três linhas, CTAs largos e seções em coluna; login/cadastro mostram logo e formulário imediatamente; os indicadores das telas operacionais usam duas colunas.
- Menu mobile da landing abriu em `390`, `430` e `768px`.
- Drawer de navegação em Clientes: largura de 320px em viewport 390; lista Início, Clientes, Cobranças, Planos, Automações, Integrações e Configurações; fechou por Escape e backdrop.
- Filtros de Clientes em 390px: busca fora da folha; filtros e ordenação lado a lado; seletor de vencimento mostrou “Todos” e dias 1–31; seleção do dia 1 e fechamento em “Aplicar filtros” passaram. Ordenação Cliente/decrescente atualizou os estados existentes e fechou em “Aplicar ordenação”.
- Filtros de Cobranças em 390px: busca em largura total; filtros e ordenação lado a lado; seletor de vencimento mostrou “Todos” e dias 1–31; Escape e backdrop fecharam a folha; ordenação abriu corretamente.
- Automações: mensagens longas ficam resumidas em mobile e têm controle explícito “Visualizar mensagem completa”.
- Screenshots full page e estados de menu/filtros: `.qa/screenshots/mobile-review/` (22 PNGs). Evidência numérica: `results.json` e `interaction-checks.json` na mesma pasta.
- `/dashboard` é a rota existente para a página “Início”. A rota literal `/inicio` retornou 404.

### Resultado por viewport

| Viewport | Público (`/`, `/login`, `/cadastro`) | Operacional autenticado |
|---|---|---|
| 390x844 | PASS — 3/3; sem overflow | WARN — sem sessão ADMIN/OPERATOR ou variáveis Supabase |
| 430x932 | PASS — 3/3; sem overflow | WARN — sem sessão ADMIN/OPERATOR ou variáveis Supabase |
| 768x1024 | PASS — 3/3; sem overflow | WARN — sem sessão ADMIN/OPERATOR ou variáveis Supabase |
| 1280x800 | PASS — 3/3; sem overflow | WARN — sem sessão ADMIN/OPERATOR ou variáveis Supabase |
| 1440x900 | PASS — 3/3; sem overflow | WARN — sem sessão ADMIN/OPERATOR ou variáveis Supabase |

### Limites

- Este ambiente não possui `NEXT_PUBLIC_SUPABASE_URL` nem chave publicável configurada e não oferece sessão QA. As rotas operacionais retornam a estrutura visual sem dados reais, mas telas internas, cards com clientes/cobranças, drawers de detalhes/edição e ações financeiras não foram validados com uma conta autenticada.
- Nenhum cliente, pagamento, renovação ou integração foi alterado. A separação ADMIN/OPERATOR permanece sem validação de browser nesta rodada.
- O teste público cobre os cinco viewports; o WARN operacional aplica-se aos cinco até a execução com usuários de QA isolados. `/inicio` precisa ser tratado como `/dashboard` no próximo roteiro autenticado.

### Gates desta revisão

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; 27 rotas geradas.
- `git diff --check` — passou.
- Nenhuma migration, regra financeira, API, RPC, dado ou configuração de papel foi alterada.

**Conclusão MOBILE:** código e QA público aprovados; QA autenticado permanece WARN e é necessário antes da aprovação global. Nenhum merge na `main`.

## Tabelas operacionais compactas em mobile — 2026-10-06

### Alteração

- Clientes e Cobranças usam linhas compactas até 768px dentro de wrappers com rolagem horizontal própria; o desktop mantém a apresentação existente.
- Clientes agrupam plano sob o nome e ciclo junto aos créditos; Cobranças agrupam valor, recebido e saldo na coluna Financeiro.
- Cabeçalho e coluna Cliente usam sticky; busca, folhas de filtros/ordenação, paginação, ordenação server-side e handlers existentes permanecem no lugar.
- Largura intrínseca definida: aproximadamente 658px em Clientes e 671px em Cobranças. Largura do documento deve permanecer no viewport; o wrapper da tabela pode rolar internamente.
- Ações mobile usam botões compactos e ícone de detalhes com rótulo acessível. Nenhuma migration, RPC, dado ou regra financeira foi alterada.

### Gates de código

- `npm run lint` — PASS.
- `npm test` — PASS, 29/29.
- `npm run build` — PASS, 27 rotas.
- `git diff --check` — PASS.

### QA visual pendente

- Chromium foi iniciado contra build local, mas o middleware redirecionou as rotas protegidas para `/login` ao fornecer sessão sintética. Sem uma sessão QA válida, não foi possível obter screenshots reais das tabelas nem exercitar scroll/sticky, filtros, ordenação, drawers, ações e paginação.
- As capturas `clientes-390.png`, `clientes-430.png`, `cobrancas-390.png`, `cobrancas-430.png` produzidas nessa tentativa mostram a tela de login; não são evidência visual das listagens.
- Com login QA isolado, repetir em 390x844, 430x932 e 768x1024; registrar a contagem de linhas por viewport e screenshots `clientes-390.png`, `cobrancas-390.png`, `clientes-430.png`, `cobrancas-430.png`. Validar `document.documentElement.scrollWidth <= window.innerWidth` e scroll interno no wrapper.

**Conclusão desta revisão:** gates de código aprovados; comparação visual solicitada e QA autenticado das telas operacionais continuam pendentes. Sem merge na `main` e sem push.
