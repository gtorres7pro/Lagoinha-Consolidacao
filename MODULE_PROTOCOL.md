# 📋 Protocolo de Novo Módulo — Zelo Pro

> Siga este protocolo **na ordem** sempre que um novo módulo for adicionado à plataforma.
> Cada passo garante que o módulo esteja corretamente integrado ao sistema de gating por plano, controle de acesso por usuário e documentação.

---

## ⚡ Quick Checklist (para copiar a cada módulo)

```
MÓDULO: _______________  |  CHAVE: _______________  |  PLANO MÍNIMO: _______________

[ ] 1. Chave snake_case definida
[ ] 2. Adicionado à matriz de planos (showUpgradeModal)
[ ] 3. Sidebar nav item com data-module criado
[ ] 4. Gate automático verificado (applyUserModuleGating)
[ ] 5. Adicionado ao MODULE_OPTIONS (gestão de equipe)
[ ] 6. Override manual testado (painel Dev ou SQL)
[ ] 7. Lazy-load implementado em hub-<modulo>.js
[ ] 8. GEMINI.md atualizado (seções 2, 3, 4, 8)
```

---

## Passo 1 — Definir a Chave do Módulo

Escolha uma chave em `snake_case`. Ela será usada em:
- `workspaces.modules[]` no banco de dados
- Atributo `data-module` no sidebar HTML
- `applyUserModuleGating()` no JS
- Lazy-load em `hub-<modulo>.js`

**Exemplos existentes:** `consolidados`, `visitantes`, `start`, `crie`, `cantina`, `financeiro`, `voluntarios`, `we_care`

---

## Passo 2 — Adicionar à Matriz de Planos

**Arquivo:** `frontend/hub-dashboard.js` → função `showUpgradeModal()`

Adicione a chave no plano correto e defina os módulos base de cada tier:

```js
const PLAN_MODULES = {
  free:      ['consolidados', 'visitantes', 'start', 'batismo', 'novos_membros'],
  starter:   [...free, 'tasks', 'transmissao', 'aniversariantes'],
  essencial: [...starter, 'financeiro', 'relatorios', 'voluntarios'],
  founders:  [...essencial, 'crie', 'cantina', 'ai_whatsapp', 'we_care'],
};
// Adicione '<nova_chave>' no tier correto acima ↑
```

**Também em `dashboard.html`**, adicione o item `<li>` na coluna correta do modal de planos:

```html
<!-- No card do plano correspondente -->
<li class="included">Nome do Módulo</li>
<!-- Nos planos inferiores, adicione como locked: -->
<li class="locked">Nome do Módulo</li>
```

---

## Passo 3 — Sidebar Nav Item

**Arquivo:** `frontend/dashboard.html` → seção da sidebar

```html
<div class="nav-item" data-module="<nova_chave>" onclick="switchTab('<nova_chave>')">
  <span class="nav-icon">🆕</span>
  <span class="nav-label">Nome do Módulo</span>
</div>
```

> ⚠️ O atributo `data-module` é **obrigatório** — é o que `applyUserModuleGating()` lê para esconder/mostrar automaticamente o item na sidebar.

---

## Passo 4 — Gate Automático (sem código extra)

A função `applyUserModuleGating()` em `hub-dashboard.js` já lê **todos os `data-module`** do sidebar e oculta automaticamente os que não estão em `window._wsModules`.

**Nenhum código adicional é necessário**, desde que o `data-module` esteja correto no passo 3.

> Se o módulo tiver vistas/divs secundárias que também precisam de gate, adicione ao mapa:
> ```js
> const moduleViewMap = { '<nova_chave>': '#view-<nova_chave>' };
> ```

---

## Passo 5 — Controle de Acesso por Usuário

**Arquivo:** `frontend/hub-dashboard.js` → `openManageTeam()` / constante `MODULE_OPTIONS`

```js
const MODULE_OPTIONS = [
  { key: 'consolidados', label: 'Consolidação' },
  { key: 'visitantes',   label: 'Visitantes'  },
  // ... módulos existentes ...
  { key: '<nova_chave>', label: 'Nome do Módulo' }, // ← adicionar aqui
];
```

Isso permite que o admin do workspace conceda ou revogue acesso ao módulo **por usuário**, independentemente do plano do workspace.

---

## Passo 6 — Override Master Admin

Para ativar manualmente o módulo em um workspace específico (modo suporte ou demo):

**Via painel Dev (UI):**
1. Acessar `dashboard.html` → aba Desenvolvedor
2. Clicar em **"Plano"** ao lado do workspace
3. Selecionar o plano correto, **ou**

**Via Supabase Studio (SQL direto):**
```sql
-- Adicionar módulo avulso sem alterar o plano
UPDATE workspaces
SET addon_modules = array_append(addon_modules, '<nova_chave>')
WHERE id = '<workspace_id>';

-- Ou adicionar diretamente no array de módulos
UPDATE workspaces
SET modules = array_append(modules, '<nova_chave>')
WHERE id = '<workspace_id>';
```

---

## Passo 7 — Lazy Load em hub-\<modulo\>.js

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

async function load<Modulo>Data() {
  const sb = window.supabaseClient;
  const wsId = window._currentWorkspaceId;
  // ... carregar dados do módulo ...
}
```

Incluir o script no `dashboard.html` antes do `</body>`:
```html
<script src="/hub-<modulo>.js"></script>
```

---

## Passo 8 — Atualizar GEMINI.md

Após implementar, adicionar nas seções:

| Seção | O que adicionar |
|---|---|
| **Seção 2** | Descrição do módulo (funcionalidades, sub-tabs, arquivos-chave) |
| **Seção 3** | Novas tabelas DB ou colunas |
| **Seção 4** | Novas Edge Functions |
| **Seção 8** | Entrada datada no Maintenance Log |

---

## 🔒 Regras de Segurança

- **Frontend gate ≠ segurança.** O gating de sidebar é apenas UI. Toda Edge Function do módulo deve validar acesso via `workspaces.modules` no banco antes de processar qualquer ação.
- **RLS obrigatório.** Toda nova tabela deve ter RLS ativado com política `workspace_id = auth.uid()` ou equivalente.
- **Admin override nunca em código frontend.** Toda liberação manual deve passar pelo painel Dev ou SQL — nunca hardcoded no JS.

---

*Protocolo mantido em sincronia com GEMINI.md Seção 9. Última atualização: 2026-04-12*
