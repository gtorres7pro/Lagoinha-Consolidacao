# Nova Assistente Mila (IA do Dashboard)

Este plano detalha a implementação da **Mila**, uma assistente baseada em LLM embutida no próprio painel do Zelo Pro, capaz de executar ações reais na plataforma (como abrir tickets e gerenciar a base de conhecimento).

## User Review Required

> [!IMPORTANT]
> **Chave da OpenAI ou Gemini?** O Gemini 2.5 Flash suporta *Function Calling* (chamada de ferramentas) que é exatamente o formato que a Mila precisará para executar as ações (atualizar banco de dados, enviar email de suporte). Vou usar a *mesma chave Gemini* atual, conforme o seu pedido. Caso falhe, a recomendação clássica de Function Calling sempre recai no GPT-4o-mini, mas o Gemini 2.5 atende quase tão perfeitamente.

> [!NOTE]
> Estilos Visuais a Definir: Para a interface, serei fiel ao tema *Dark / Glassmorphism* com amarelo do Zelo Pro, criando balões de chat idênticos ao ChatGPT, mas estritamente dentro da paleta do Lagoinha.

## Proposed Changes

### Dashboard e Frontend (Zelo Pro)

#### [MODIFY] `frontend/dashboard.html`
- Transformar o menu atual bloqueado "IA Chat" no menu **Mila AI** e remover a classe de bloqueio.
- Construir a sessão inteira do Chat (`#view-mila`).
  - Painel lateral esquerdo com atalhos de "Nova Conversa" (histórico futuro).
  - Painel central com visual premium (Dark mode) das mensagens.
  - Input fixado no rodapé para mensagens textuais.
- Remover telas de setup de IA (caso existissem antigamente na view IA) e passar estritamente para as páginas de configuração.

#### [MODIFY] `frontend/hub-dashboard.js`
- Adicionar o *lifecycle* do Chat da Mila (captura de "Enter", criação de bolhas na tela, loader de digitação).
- Encapsular a requisição à nova API `/functions/v1/mila-chat` com o token JWT de acesso do usuário.
- Incluir as credenciais de "Token WhatsApp" e "Token Gemini" dentro da aba de **Configurações** da própria equipe para ficar organizado apenas do lado Administrativo, longe do Assistente IA da Mila.

---

### Supabase e Backend

#### [NEW] edge function `supabase/functions/mila-chat/index.ts`
- Script dedicado para receber as mensagens oriundas do painel do Dashboard.
- **Segurança Auth:** Validará o token JWT do usuário (`supabase.auth.getUser()`) limitando que a Mila manipule apenas o Workspace em que quem digita está logado.
- **Function Calling (Tools):** 
  Ensinaremos o Gemini (Mila) sobre as seguintes ferramentas mágicas:
  1. `open_support_ticket(description)`: Pega a dor do usuário, bate na API do Resend e manda email para equipe de vocês com cópia pro dono da conta.
  2. `read_knowledge_base()`: Retorna para a Mila como leitura interna o JSON atual do workspace.
  3. `update_knowledge_base(new_data)`: Permite que a Mila, sob pedido do usuário (Ex: "Mude o horário do Culto para as 19h"), faça o update oficial no JSON da Base de Dados na tabela.
- Retorno processado para a tela com a formatação final humana e cordial da LLM.

## Open Questions

> [!WARNING]
> E-mail do Suporte Zelo Pro: Para qual endereço oficial o chamado de Supporte deve ser enviado? Ex: `suporte@7pro.tech`? A Mila precisará saber o e-mail exato do time de vocês para rotear as mensagens de socorro.

> [!TIP]
> Qual deve ser a "frase de largada" da Mila quando abrimos a tela pela primeira vez? Um belo popup: "Oi! Sou a Mila, sua parceira de gestão no Zelo Pro..."?

## Verification Plan

### Testes Manuais
1. Acessar a tela da Mila, ela deverá começar a conversar ativamente.
2. Pedir para a Mila: *Ache um bug, por favor envie um email de suporte dizendo que meu painel não carrega*.
3. Garantir o recebimento do e-mail.
4. Pedir: *Quais informações você tem do meu workspace?* e depois *Mude o horário do culto Gênesis para quarta-feira.*
5. Navegar nas configurações de Workspace e ver se as caixas de WhatsApp (Token) foram salvas perfeitamente por lá.
