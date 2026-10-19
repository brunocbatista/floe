---
title: Projeto adicionado por agente não aparece na sidebar
status: idea
kind: fix
created: 2026-10-18
---

Quando um agente registra um projeto novo via MCP (`mcp__floe__add_project`), o projeto não aparece na sidebar do Floe. Parece que só aparece depois de reiniciar o Floe. Tudo o que um agente registra tem que aparecer na hora para o usuário.

Reprodução (2026-10-18): um agente chamou `add_project` com path `/Users/r2luna/Documents/Dev/omarchy-config` e a resposta foi `created: true`, group "Projects". Na sequência chamou `create_session` nesse worktree, que funcionou (session a12bd909-e4d6-4028-bc64-3642f72f78e1). O `list_projects` já lista o projeto, mas a UI não mostrou nem o projeto nem a sessão.

Esperado: o `add_project` (e também o `create_session` num projeto novo) notifica a UI, e a sidebar atualiza sem reiniciar.
