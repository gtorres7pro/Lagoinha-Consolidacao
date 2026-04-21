# 📋 Protocolo de Novo Módulo — Zelo Pro

> Siga este protocolo **na ordem** sempre que um novo módulo for adicionado à plataforma.
> Cada passo garante que o módulo esteja corretamente integrado ao sistema de gating por plano, controle de acesso por usuário e documentação.

---

## ⚡ Quick Checklist (para copiar a cada módulo)

```
MÓDULO: _______________  |  CHAVE: _______________  |  PLANO MÍNIMO: _______________

[ ] 1. Chave snake_case e metadados adicionados a AVAILABLE_MODULES (hub-dashboard.js)
[ ] 2. Chave adicionada à sua respectiva lista em PLAN_CONFIG (se aplicável ao plano base)
[ ] 3. Sidebar nav item com id "nav-<chave>" criado em dashboard.html
[ ] 4. Mapeado nos arrays PLAN_NAV_MAP e USER_NAV_MAP (hub-dashboard.js)
[ ] 5. Override/teste do Master Admin verificado (Painel Dev)
[ ] 6. Lazy-load implementado em hub-<modulo>.js
[ ] 7. GEMINI.md atualizado (seções 2, 3, 4, 8)
```

---

## Passo 1 — Definir o Módulo em AVAILABLE_MODULES

**Arquivo:** `frontend/hub-dashboard.js` → constante `AVAILABLE_MODULES`

Escolha uma chave em `snake_case`. Defina os sub-módulos se existirem (ex: CRIE tem playlists, workshop, etc.). Isso automaticamente populamenta os editores de Workspace (Painel Dev) e Usuário (Configurações).

```js
const AVAILABLE_MODULES = [
    // ... módulos existentes ...
    {
        key: '<nova_chave>',
        label: 'Nome do Módulo',
        svg: '<svg>icone</svg>',
        submodules: [
            { key: '<nova_chave>.sub_1', label: 'Funcionalidade Extra 1' }, // se aplicável
        ]
    }
];
```

---

## Passo 2 — Adicionar à Matriz de Planos (PLAN_CONFIG)

**Arquivo:** `frontend/hub-dashboard.js` → constante `PLAN_CONFIG`

Adicione a chave e seus sub-módulos base ao array respectivo do plano onde ele deve ser introduzido na hierarquia, por exemplo, `essencial` ou `founders`.

```js
const PLAN_CONFIG = {
    free: { modules: ['consolidados', 'visitantes', 'start'] },
    starter: { modules: ['consolidados', 'visitantes', 'start', 'tasks', 'transmissao', 'aniversariantes'] },
    // Adicione a <nova_chave> e os submódulos que acompanham o plano
};
```

---

## Passo 3 — Sidebar Nav Item e Mapeamento

**Arquivo:** `frontend/dashboard.html` → seção da sidebar

Crie o item no HTML da Sidebar usando um **ID** correspondente ao módulo (ou classe/submódulo).

```html
<div class="nav-item" id="nav-<nova_chave>" onclick="switchTab('<nova_chave>')">
  <span class="nav-icon">🆕</span>
  <span class="nav-label">Nome do Módulo</span>
</div>
```

**Arquivo:** `frontend/hub-dashboard.js` → constantes `PLAN_NAV_MAP` e `USER_NAV_MAP`

Adicione o mapeamento para que a automação `applyPlanGating` e `applyUserModuleGating` consigam encontrar seus elementos HTML pelo DOM e realizar o toggle de visibilidade `display: block|none`.

---

## Passo 4 — Gate Automático (sem código extra)

A função `applyUserModuleGating()` lê os mapas configurados acima para avaliar a coluna `users.modules` e comparar com o `workspaces.modules` base do plano. 
**Nenhum código condicional adicional de mostrar/esconder HTML** é necessário, a arquitetura garante permissões modulares do Workspace para baixo ao Usuário final.

---

## Passo 5 — Override do Master Admin

Para testar ou liberar os recursos explicitamente num workspace (modo trial, suporte ou Venda de Adicional):

**Via Painel Dev (Unified Workspace Editor UI):**
1. Acessar `dashboard.html` → aba Desenvolvedor
2. Clicar em **"Configurar"** no workspace
3. Marcar livremente o módulo avulso ou alterar o plano base -> O sistema grava o override final no `workspaces.modules` do banco.

---

## Passo 6 — Lazy Load em hub-\<modulo\>.js

**Arquivo:** `frontend/hub-<modulo>.js` (criar se não existir)

```js
// Padrão obrigatório — IIFE que patcheia window.switchTab
(function() {
  const _orig = window.switchTab;
  window.switchTab = function(tab) {
    _orig && _orig(tab);
    if (tab === '<nova_chave>' && !window._<modulo>Loaded) {
      window._<modulo>Loaded = true;
      load<Modulo>Data(); // sua função de carregamento inicial
    }
  };
})();
```

Fazer a inclusão `<script src="/hub-<modulo>.js"></script>` no `dashboard.html`.

---

## Passo 7 — Atualizar GEMINI.md

Após implementar, adicionar nas seções:

| Seção | O que adicionar |
|---|---|
| **Seção 2** | Descrição do módulo (funcionalidades, sub-tabs, arquivos-chave) |
| **Seção 3** | Novas tabelas DB ou colunas |
| **Seção 4** | Novas Edge Functions |
| **Seção 8** | Entrada datada no Maintenance Log |

---

## 🔒 Regras de Segurança

- **Frontend gate ≠ segurança.** O gating de sidebar é apenas UI. Toda Edge Function do módulo deve validar acesso listado via `workspaces.modules` ou `users.modules`.
- **RLS obrigatório.** Toda tabela nova deve ter RLS ativo `workspace_id = auth.uid()` limitando o escopo ao provedor de tenancy do projeto.
- **Não crie hardcodes JS.** Se precisar esconder itens adicionais, coloque restrições via `window._wsModules` ou o objeto do membro logado `window._currentUser.modules`.

---

*Protocolo reformulado para Granularidade de Nível Acesso 2.0. Última atualização: 2026-04-21*
