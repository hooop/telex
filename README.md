# telex

Le second terminal qui explique, en direct, ce que Claude Code ou Codex est en train de construire.

```bash
cd mon-projet
telex claude      # ou : telex codex
```

Le vrai CLI de l'agent s'ouvre dans une nouvelle fenêtre Terminal. Tu l'utilises normalement. Pendant ce temps, la timeline se remplit dans le terminal d'origine :

```text
18:08:58  ✕  Tester l’API sur un port libre

             Le premier lancement a révélé que les sous-tests fermaient
             plusieurs fois la même instance du serveur.

             Error [ERR_SERVER_NOT_RUNNING]: Server is not running.

18:11:09  ✓  Corriger l’isolation des tests
```

`[↑↓]` naviguer · `[Entrée]` détails (fichiers, commandes, origine, événements bruts `[R]`) · `[D]` diff de l'étape · `[T]` tests · `[Q]` quitter.

```bash
telex sessions            # sessions enregistrées
telex replay last         # rouvrir une timeline (en direct si la session tourne encore)
telex replay <id> --print # version texte
telex run <id>            # repli si le second terminal n'a pas pu s'ouvrir
```

## Fonctionnement

- **Aucune clé API.** C'est l'agent lui-même qui écrit la narration, via un outil MCP local `timeline` (événements `start`, `complete`, `fail`, `replace`, `validate`). Il consomme ton abonnement habituel, à raison de quelques appels par fonctionnalité.
- **Aucune modification de ta configuration.** Tout est injecté au lancement :
  - pour Claude Code : `--mcp-config`, `--settings` (autorisation de l'outil et hook `PostToolUse`), `--append-system-prompt` ;
  - pour Codex : `-c mcp_servers.telex…` et `-c developer_instructions=…`.
- **Faits vérifiables.** À chaque événement, telex prend un instantané du projet dans un dépôt git « fantôme » propre à la session. Il sait ainsi quels fichiers chaque étape a réellement modifiés et peut afficher son diff. Ton dépôt n'est jamais touché. Avec Claude Code, les commandes shell réellement exécutées (tests, builds) sont aussi observées. Si l'agent déclare une vérification alors que la dernière commande de test observée a échoué, ce fait est affiché sous la ligne.
- **Local et privé.** Les sessions sont stockées dans `~/.telex/sessions/<id>/` (fichiers en mode 600). Les secrets sont masqués partout. Les fichiers `.env*`, `*.pem`, `*.key`, etc. sont exclus des instantanés. Rien n'est envoyé à l'extérieur.

## Architecture

```text
src/adapters/index.js        adaptateurs Claude Code / Codex (lancement du vrai CLI)
src/adapters/claude-hook.js  hook PostToolUse : commandes observées
src/mcp-server.js            serveur MCP stdio, outil « timeline » → events.jsonl
src/instructions.js          consignes et schéma communs aux deux agents
src/timeline.js              événements → lignes (●, ✓, ✕, –), recoupement
src/workspace.js             instantanés git fantômes, fichiers et diff par étape
src/tui.js, src/render.js    interface terminal (sans dépendance)
src/terminals.js             ouverture du second terminal (Terminal.app, iTerm2)
src/store.js, src/redact.js  sessions locales, masquage des secrets
```

Node ≥ 20, aucune dépendance. Tests : `npm test`.

## Limites connues (v0.1)

- macOS uniquement pour l'ouverture automatique (Terminal.app, iTerm2). Ailleurs, la commande de repli `telex run <id>` s'affiche.
- Codex : les commandes exécutées ne sont pas encore observées, car les hooks Codex exigent une approbation de confiance. Les fichiers et le diff par étape fonctionnent.
- Si la fenêtre de l'agent est fermée brutalement, la session reste marquée « en cours ».
- La qualité du découpage dépend de l'agent. Les consignes sont dans `src/instructions.js`.
