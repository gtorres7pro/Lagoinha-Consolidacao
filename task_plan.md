# Task Plan: Lagoinha Consolidação

## Fase 1 — UI de Configuração de IA (Concluída/Em Revisão)
**Objetivo:** Cada church admin consegue configurar seu próprio WhatsApp e IA direto no dashboard, sem precisar de banco SQL.
- [x] Nova página "Configuração de IA" no menu lateral do dashboard
- [x] Seção WhatsApp Business API (Tokens e status de conexão)
- [x] Seção Modelo de IA (Gemini API Key, toggle de áudio)
- [x] Seção Notificações de Handoff (multi-select de usuários)
- [x] Seção Base de Conhecimento (leitura/edição simples)
- [x] Proteção total: frontend isolado de ler credentials diretamente

## Fase 2 — Migração do Prompt & Fluxo Inteligente (FASE ATUAL)
**Objetivo:** Migrar o prompt atual da outra plataforma e construir lógica de fluxo dentro do Gemini.
- [x] Sistema de múltiplos workspaces com números distintos — já arquitetado com Webhook e DB.
- [x] Estabilização do Webhook + Accumulator Async (Edge Functions, pg_net, Timeout race)
- [x] Importar e adaptar o prompt atual para o formato da Ju (Ajuste fino de Personality e Chunking finalizados)
- [ ] Mapear as "ações" do fluxo antigo (ex: "marcar batismo", "agendar visita") para `tasks` no banco
- [ ] IA detecta intenção e cria tarefa automaticamente no lead (ex: `type: "batismo"`) em Background

## Fase 3 — Webhook Avançado (Humanização Completa)
**Objetivo:** Tornar o agente indistinguível de um humano real.
- [ ] Typing indicator: enviar status `typing` antes de cada resposta
- [ ] message_echoes: detectar quando humano responde pelo app e ativar lock 30min
- [ ] Transcrição de áudio: baixar OGG do WhatsApp e transcrever com Gemini STT
- [ ] TTS ElevenLabs: responder com áudio humanizado quando usuário enviar áudio
- [ ] Notificação de handoff: enviar email para consolidadores quando IA escalar

## Fase 4 — Analytics & Produção
**Objetivo:** Métricas, múltiplos workspaces em produção e aprovação Meta.
- [ ] Implementar visualização de KPIs no Frontend baseada no tráfego real.
- [ ] Testes de Carga
- [ ] Submissão do APP final na Meta.
