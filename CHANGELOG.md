# Journal des modifications

Les versions suivent le [versionnage sémantique](https://semver.org/lang/fr/). Tant que telex est en 0.x, une version mineure peut changer le format des sessions.

## [0.1.0] — 2026-09-26

Première version publique.

### Fonctionnalités

- Timeline en direct pour **Claude Code** et **Codex**, écrite par l'agent lui-même via un outil MCP local (`timeline`) : aucune clé API, aucune modification de la configuration de l'agent.
- Instantanés git « fantômes » à chaque événement : fichiers modifiés et diff de chaque étape, sans toucher au dépôt du projet.
- Commandes shell observées avec Claude Code (hook `PostToolUse`) et recoupement : une étape déclarée réalisée alors que la dernière commande de test a échoué est signalée.
- Interface interactive : détails `[↵]`, diff `[D]`, tests `[T]`, événements bruts `[R]`.
- Sessions locales rejouables : `telex sessions`, `telex replay`, `telex replay --print`.
- Nettoyage : `telex rm <id>` et `telex prune [jours] --yes`.
- `telex --version`.
- Ouverture du terminal de l'agent : Terminal.app, iTerm2, WezTerm, tmux (tous systèmes), terminaux Linux courants, ou commande libre via `TELEX_TERMINAL`.
- Sessions interrompues détectées (fenêtre fermée, processus tué, machine arrêtée) : elles ne restent plus « en cours ».
- Consignes personnelles ajoutées à celles de telex : `~/.telex/instructions.md`.

### Robustesse

- Messages d'erreur d'une ligne avec une piste de résolution ; trace complète avec `TELEX_DEBUG=1`.
- Le serveur MCP et le hook ne s'arrêtent jamais sur une erreur : elle est consignée dans `errors.jsonl` et affichée en bas de la timeline.
- Une session illisible est signalée sans bloquer les autres ; écritures de `meta.json` atomiques.
- Le terminal est toujours restauré (quitter, signal, erreur inattendue).

### Sécurité

- Séquences d'échappement du terminal neutralisées dans tout ce qui vient de l'agent, des commandes ou du projet.
- Masquage des secrets élargi (options de ligne de commande, valeurs entre guillemets, jetons npm, GitLab, Hugging Face).
- Fichiers sensibles exclus des instantanés (`.env*`, clés, `.aws/`, `.ssh/`, `credentials`, `*.tfvars`…) ; fichiers de plus de 1 Mo jamais copiés ; dépôt fantôme lisible par son seul propriétaire.
- Identifiants de session validés : aucune commande ne peut écrire hors de `~/.telex/sessions`.
