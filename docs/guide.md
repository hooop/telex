# Guide de Telex

[← Présentation et démarrage rapide](../README.md)

Installation, commandes, raccourcis et fonctionnement détaillé de Telex.

## Sommaire

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Commandes](#commandes)
- [Les vues](#les-vues)
- [Raccourcis clavier](#raccourcis-clavier)
- [Fonctionnement](#fonctionnement)
- [Terminaux pris en charge](#terminaux-pris-en-charge)
- [Personnaliser les consignes de l'agent](#personnaliser-les-consignes-de-lagent)
- [Données et confidentialité](#données-et-confidentialité)
- [Variables d'environnement](#variables-denvironnement)
- [Dépannage](#dépannage)
- [Limites connues](#limites-connues)
- [Développement](#développement)
- [Licence](#licence)

## Installation

### Prérequis

| Élément | Version | Rôle |
|---|---|---|
| macOS ou Linux | — | Windows n'est pas pris en charge ; utilisez [WSL](https://learn.microsoft.com/windows/wsl/). |
| [Node.js](https://nodejs.org/) | 22 ou plus | exécute telex (aucune dépendance npm) |
| [git](https://git-scm.com/) | 2.31 ou plus | instantanés, fichiers et diff par étape (sans git, la timeline fonctionne mais sans fichiers ni diff) |
| [Claude Code](https://docs.claude.com/claude-code) et/ou [Codex CLI](https://github.com/openai/codex) | récent | l'agent, installé et connecté à votre compte |

Vérifiez que l'agent répond : `claude --version` ou `codex --version`.

### Depuis GitHub

<img src="demo/install.gif" width="450" alt="Installation depuis GitHub">

```bash
npm install -g github:hooop/telex
telex --version
```

### Depuis les sources

```bash
git clone https://github.com/hooop/telex.git
cd telex
npm link        # rend la commande « telex » disponible partout
telex --version
```

telex n'a aucune dépendance : il n'y a rien d'autre à installer.

### Mettre à jour, désinstaller

```bash
npm install -g github:hooop/telex     # mise à jour (ou « git pull » dans le clone)
npm uninstall -g telex                # désinstallation
rm -rf ~/.telex                       # supprime aussi toutes les sessions enregistrées
```

## Démarrage rapide

```bash
cd mon-projet
telex claude        # ou : telex codex
```

1. telex crée une session dans `~/.telex/sessions/<id>/`.
2. Le **vrai** CLI de l'agent s'ouvre dans une nouvelle fenêtre (ou un panneau tmux), titrée `Claude Code · mon-projet · telex`. Vous l'utilisez normalement.
3. La timeline s'affiche dans le terminal d'origine. Elle reste vide (`Prêt`) jusqu'à ce que l'agent commence une étape.
4. Quand vous quittez l'agent (`/exit`, ou en fermant sa fenêtre), la session se termine : l'en-tête passe à `SESSION TERMINÉE` et un bilan s'affiche. Une tâche finie ne termine pas la session : l'agent attend la demande suivante.

Quitter la timeline (`Q`) n'arrête pas l'agent. Pour la rouvrir : `telex replay last`.

Si aucun terminal n'a pu être ouvert automatiquement, telex l'indique et vous donne la commande à lancer vous-même :

```text
TELEX  impossible d’ouvrir un second terminal automatiquement
aucun terminal pris en charge n’a été détecté (linux).
Choisissez-en un avec la variable TELEX_TERMINAL (voir le README).

Ouvrez un autre terminal et lancez :

  telex run 20260922-143204-3f4f

La timeline démarre ici dans 5 secondes…
```

## Commandes

| Commande | Effet |
|---|---|
| `telex claude [options…]` | Lance Claude Code dans un nouveau terminal et la timeline ici. |
| `telex codex [options…]` | Idem avec Codex. |
| `telex sessions` | Liste les sessions enregistrées. |
| `telex replay [id\|last] [--print]` | Rouvre la timeline d'une session (en direct si elle tourne encore). |
| `telex run <id>` | Repli : lance l'agent d'une session dans le terminal courant. |
| `telex rm <id> [--force]` | Supprime une session. |
| `telex prune [jours] [--yes]` | Supprime les sessions commencées il y a plus de N jours (30 par défaut). |
| `telex --version` | Affiche la version (`-v`, `version`). |
| `telex --help` | Affiche l'aide (`-h`, `help`, ou `telex` seul). |

**Identifiants de session.** Ils ont la forme `AAAAMMJJ-HHMMSS-xxxx` (date et heure locales du lancement, puis 4 caractères aléatoires). Partout où un identifiant est attendu, vous pouvez donner un **préfixe unique** (`telex replay 20260922-1432`) ou `last` pour la session la plus récente. Un préfixe qui correspond à plusieurs sessions est refusé, avec une liste de candidats.

### `telex claude` et `telex codex`

Toutes les options placées après `claude` ou `codex` sont transmises telles quelles à l'agent :

```bash
telex claude --continue
telex codex --model <modèle>
```

La session est rattachée au dossier courant, dont le nom devient le nom du projet.

### `telex sessions`

```text
20260922-143204-3f4f  22/09/2026 14:32  mon-projet  Claude Code · 8 lignes
20260923-091512-a81c  23/09/2026 09:15  api  Codex · 3 lignes  ● en cours
20260923-101030-77d2  23/09/2026 10:10  api  Codex · 0 ligne  ○ en attente de l’agent
20260924-180244-0be1  24/09/2026 18:02  site  Claude Code · 5 lignes  ■ interrompue
⚠ 20260925-120000-9f3a  ignorée : session 20260925-120000-9f3a illisible : meta.json est corrompu  (telex rm 20260925-120000-9f3a)

telex replay <id>   ou   telex replay last
```

Chaque ligne donne l'identifiant, la date de début, le projet, l'agent et le nombre de lignes de timeline. L'état final indique :

| État | Signification |
|---|---|
| *(rien)* | Session terminée normalement. |
| `● en cours` | L'agent tourne encore. |
| `○ en attente de l’agent` | L'agent n'a pas encore été lancé (repli `telex run` pas encore exécuté). |
| `■ interrompue` | L'agent a disparu sans que la fin soit enregistrée : fenêtre tuée, machine arrêtée… |
| `⚠ … ignorée` | Session illisible. Les autres restent accessibles ; supprimez-la avec `telex rm`. |

### `telex replay`

Sans argument, rouvre la dernière session. Si elle tourne encore, la timeline reprend en direct.

Avec `--print`, ou quand la sortie n'est pas un terminal (`telex replay last > session.txt`), la timeline est imprimée en texte, récits compris :

```text
14:36:00  ✕  Configurer l’accès à Resend
-------------------------------------------------------------------------------
             L’envoi est interrompu : la clé attendue n’est pas disponible dans
             la configuration du projet.

             RESEND_API_KEY introuvable
-------------------------------------------------------------------------------
14:36:30  ✓  Corriger la configuration de Resend
-------------------------------------------------------------------------------
             Le projet recherche maintenant la clé sous le bon nom :
             RESEND_API_KEY.
-------------------------------------------------------------------------------

Bilan : 5 étapes réalisées · 1 vérification exécutée · 1 erreur · 1 approche remplacée
```

### `telex run <id>`

Commande de repli, à lancer dans un second terminal quand telex n'a pas pu en ouvrir un. Elle refuse une session terminée ou déjà en cours ailleurs.

### `telex rm` et `telex prune`

```bash
telex rm 20260922-143204-3f4f    # supprime une session (refusé si l'agent tourne encore, sauf --force)
telex prune                      # liste les sessions de plus de 30 jours, sans rien supprimer
telex prune 7 --yes              # supprime celles de plus de 7 jours
```

`prune` ne touche jamais une session en cours. Il supprime aussi les sessions illisibles anciennes.

### Commandes internes

Ces commandes sont appelées par l'agent et par le script de lancement. Vous n'avez pas à les utiliser :

| Commande | Appelée par |
|---|---|
| `telex mcp` | l'agent, au démarrage : serveur MCP qui fournit l'outil `timeline` |
| `telex hook claude` | Claude Code, après chaque commande shell : enregistre la commande observée |
| `telex end <id> <code>` | le script de lancement, quand l'agent s'arrête : enregistre la fin de session |

## Les vues

La timeline est l'écran principal. Les trois autres vues portent sur l'étape sélectionnée (`↑` `↓` pour en changer).

- **La timeline** : suivre le travail en direct. Une ligne par étape, dans l'ordre où l'agent les commence : `○` en cours (le rond bat), `✓` réalisée ou vérifiée, `✕` erreur, `–` approche remplacée. Sous la liste, le récit de l'étape sélectionnée ; en fin de session, un bilan.
- **Les détails `↵`** : tout savoir d'une étape. Récit complet, fichiers modifiés, commandes exécutées, preuves citées par l'agent, et l'origine de chaque information (déclarée par l'agent ou observée par telex).
- **Le diff `D`** : voir ce que l'étape a changé dans le code, fichier par fichier.
- **Les tests `T`** : contrôler ce qui a réellement été testé. Les vérifications déclarées par l'agent, puis les tests et compilations observés pendant l'étape et dans le reste de la session, avec la fin de leur sortie. Avec Codex, seules les vérifications déclarées apparaissent.

## Raccourcis clavier

**Dans la timeline**

| Touche | Action |
|---|---|
| `↑` `↓` ou `k` `j` | Sélectionner l'étape précédente ou suivante. Remonter arrête le suivi en direct. |
| `Page préc.` `Page suiv.` | Sauter de 5 étapes. |
| `Début` ou `g` | Première étape. |
| `Fin`, `G` ou `Espace` | Dernière étape, et reprise du suivi en direct. |
| `←` `→` | Déplacer la surbrillance dans le menu. |
| `Entrée` | Exécuter le bouton en surbrillance (par défaut : détails). |
| `D` | Diff de l'étape sélectionnée. |
| `T` | Vue tests. |
| `Échap` | Effacer le message de la ligne d'état. |
| `Q` ou `Ctrl+C` | Quitter la timeline (l'agent continue). |

**Dans les vues détails, diff et tests**

| Touche | Action |
|---|---|
| `↑` `↓` ou `k` `j` | Défiler d'une ligne. |
| `Page préc.` `Page suiv.` ou `Espace` | Défiler de 10 lignes. |
| `D`, `T` | Passer à la vue diff ou tests. |
| `←` `→` puis `Entrée` | Choisir un bouton du menu (par exemple revenir aux détails). |
| `R` | Afficher ou masquer les événements bruts (vue détails). |
| `Échap`, `Q` ou `Retour arrière` | Revenir à la timeline. |
| `Ctrl+C` | Quitter. |

## Fonctionnement

```text
 terminal d'origine : telex             nouveau terminal : claude / codex (le vrai CLI)
        ▲ lit en continu                        │ appelle l'outil MCP « timeline »
        │                                       ▼
 ~/.telex/sessions/<id>/events.jsonl   ◄──  telex mcp       (serveur MCP lancé par l'agent)
                        shadow.git/     ◄──  instantané du projet à chaque événement
                        observed.jsonl  ◄──  telex hook claude (après chaque commande shell)
                        errors.jsonl    ◄──  erreurs internes de telex
```

### Ce qui est injecté dans l'agent

Rien n'est écrit dans la configuration de l'agent ni dans le projet : tout passe par des options de lancement, dans un script propre à la session (`launch.sh`).

- **Claude Code** reçoit :
  - `--mcp-config` : le serveur MCP `telex` ;
  - `--settings` : l'autorisation de l'outil `mcp__telex__timeline` (pour qu'il ne demande pas de confirmation) et un hook `PostToolUse` / `PostToolUseFailure` sur l'outil `Bash` ;
  - `--append-system-prompt` : les consignes de timeline.
- **Codex** reçoit des options `-c` :
  - `mcp_servers.telex.*` : le serveur MCP, dont les appels sont approuvés d'office ;
  - `developer_instructions` : les consignes.

Les consignes (dans [`src/instructions.js`](../src/instructions.js)) font environ 3 700 caractères, soit de l'ordre de 1 000 tokens par tour. S'y ajoutent quelques appels d'outil par fonctionnalité, sur votre abonnement habituel. Elles demandent à l'agent d'ouvrir une ligne par partie vérifiable du travail, jamais pour une micro-action (lecture de fichier, recherche, import), de rester factuel et de ne jamais recopier la valeur d'un secret.

### Les événements

L'agent appelle l'outil `timeline` avec un événement `start`, `complete`, `fail`, `replace` ou `validate`, un identifiant d'étape (`step_id`), l'identifiant de la fonctionnalité (`feature_id`), un titre, et éventuellement un récit, un détail technique et des preuves. telex horodate chaque événement à la réception, en retire les séquences de contrôle, masque les secrets et l'écrit dans `events.jsonl`. La timeline est reconstruite à partir de ce fichier : c'est aussi ce qui permet de rejouer une session.

### Les instantanés

À chaque événement, telex prend un instantané du projet dans un dépôt git « fantôme » propre à la session (`shadow.git`) :

- votre dépôt n'est **jamais** modifié : pas de commit, pas de changement d'index, pas de hook exécuté ;
- s'il existe, ses objets sont seulement lus (mécanisme `alternates` de git), pour ne pas recopier tout le projet ;
- les règles `.gitignore` du projet s'appliquent ;
- les dossiers de dépendances et de build (`node_modules/`, `dist/`, `build/`, `.venv/`, `target/`…) sont ignorés ;
- les fichiers sensibles sont exclus (voir [Données et confidentialité](#données-et-confidentialité)) ;
- les fichiers de plus de **1 Mo** sont repérés avant la copie et laissés de côté.

La comparaison de deux instantanés donne les fichiers et le diff de chaque étape.

### Recoupement des faits

Quand une étape est déclarée réalisée (`✓`) ou vérifiée, telex regarde les tests et compilations observés pendant cette étape. Si le **dernier** a échoué, la ligne porte en rose `Fait observé : la dernière commande de vérification a échoué (…)`. telex affiche ce fait précis plutôt qu'une conclusion avantageuse. Cela ne fonctionne qu'avec Claude Code, le seul agent dont les commandes sont observées.

Une commande compte comme test ou compilation quand elle contient un mot comme `test`, `pytest`, `tsc`, `lint`, `build` ou `make` (liste complète dans [`src/timeline.js`](../src/timeline.js)).

### Détection des sessions interrompues

Le script de lancement enregistre son numéro de processus (`agent.pid`). Quand vous fermez la fenêtre de l'agent, il reste en vie juste le temps d'enregistrer la fin de session, avec le code de sortie de l'agent. Si le processus disparaît sans rien enregistrer (processus tué, machine arrêtée…), telex s'en aperçoit : la timeline ouverte passe à `SESSION INTERROMPUE` en quelques secondes, et `telex sessions` l'affiche comme `■ interrompue`.

## Terminaux pris en charge

Sans réglage, telex essaie dans cet ordre :

| Terminal | Condition | Ouverture |
|---|---|---|
| tmux | vous êtes dans tmux (tous systèmes) | un panneau à droite, dans le dossier du projet |
| iTerm2 | macOS, lancé depuis iTerm2 | une nouvelle fenêtre |
| WezTerm | lancé depuis WezTerm | une nouvelle fenêtre (`wezterm cli spawn`) |
| Terminal | macOS | une nouvelle fenêtre de Terminal.app, placée juste à droite de la timeline |
| Linux | session graphique (`DISPLAY` ou `WAYLAND_DISPLAY`) | le premier trouvé parmi `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `kitty`, `alacritty`, `foot`, `xterm` |

Avec Terminal.app, telex place les deux fenêtres côte à côte : la timeline reste où elle est, et l'agent s'ouvre juste à sa droite, avec le même bord supérieur. Chacune garde sa taille. Si la paire ne tient pas à l'écran, elle est décalée, puis la fenêtre de l'agent est rétrécie. Pour laisser les fenêtres où Terminal les ouvre : `TELEX_LAYOUT=none`.

Sur macOS, la première ouverture peut déclencher une demande d'autorisation (« … souhaite contrôler Terminal »). Si vous l'avez refusée, réactivez-la dans **Réglages Système › Confidentialité et sécurité › Automatisation**.

### Choisir le terminal : `TELEX_TERMINAL`

| Valeur | Effet |
|---|---|
| `tmux`, `iterm`, `wezterm`, `terminal`, ou le nom d'un terminal Linux de la liste | Utiliser ce terminal. |
| `none` | Ne jamais ouvrir de terminal : telex affiche la commande `telex run <id>` à lancer vous-même. |
| toute autre valeur | Une commande shell. Elle reçoit le chemin du script de lancement dans `$1`. |

Exemples de commandes personnalisées (à adapter à votre terminal) :

```bash
export TELEX_TERMINAL='kitty --detach /bin/sh "$1"'
export TELEX_TERMINAL='alacritty -e /bin/sh "$1"'
export TELEX_TERMINAL='wezterm start -- /bin/sh "$1"'
```

La commande est considérée comme réussie si elle démarre et ne se termine pas en erreur dans la première seconde.

## Personnaliser les consignes de l'agent

La qualité du découpage dépend de l'agent. Pour l'ajuster sans toucher au code, écrivez vos propres consignes dans `~/.telex/instructions.md`. Elles sont ajoutées à la suite de celles de telex, sous le titre « Consignes supplémentaires de l'utilisateur », pour Claude Code comme pour Codex. Seuls les 4 000 premiers caractères sont pris en compte.

```markdown
- Écris les titres en anglais.
- Pour une migration de base de données, précise toujours la table concernée dans technical_detail.
- Ouvre une partie dédiée pour chaque endpoint d'API.
```

Les consignes sont lues au lancement de chaque session.

## Données et confidentialité

### Ce qui est stocké

Tout est dans `~/.telex/sessions/<id>/` (ou `$TELEX_HOME/sessions/<id>/`) :

| Fichier | Contenu |
|---|---|
| `meta.json` | Projet, dossier, agent, dates de début et de fin. |
| `events.jsonl` | Les événements de timeline, une ligne JSON par événement. |
| `observed.jsonl` | Les commandes shell observées (Claude Code) : commande, réussite, 40 dernières lignes de sortie. |
| `errors.jsonl` | Les erreurs internes de telex (serveur MCP, hook, instantanés). |
| `shadow.git/` | Les instantanés : une **copie des fichiers du projet**, hors exclusions. |
| `launch.sh`, `agent.pid` | Le script de lancement de l'agent et son numéro de processus. |
| `claude-mcp.json`, `claude-settings.json` | La configuration passée à Claude Code pour cette session. |

Les dossiers sont créés en mode `700` et les fichiers en `600` (`700` pour le script de lancement) : lisibles par vous seul. Rien n'est supprimé automatiquement. Utilisez `telex prune` ou `telex rm`.

### Ce qui ne quitte pas votre machine

telex n'envoie rien, à personne. Notez cependant que le récit de la timeline est écrit par l'agent : comme tout appel d'outil, il fait partie de sa conversation avec son fournisseur (Anthropic ou OpenAI). Les consignes de telex demandent à l'agent de ne jamais y recopier la valeur d'un secret.

### Protections

- **Fichiers jamais copiés dans les instantanés** : `.env` et `.env.*` (sauf `.env.example`, `.env.sample`, `.env.template`, `.env.dist`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.der`, `*.keystore`, `*.jks`, `*.kdbx`, `id_rsa*`, `id_dsa*`, `id_ecdsa*`, `id_ed25519*`, `.ssh/`, `.gnupg/`, `.aws/`, `.azure/`, `.kube/config`, `.docker/config.json`, `.npmrc`, `.pypirc`, `.netrc`, `.pgpass`, `.htpasswd`, `credentials`, `credentials.json`, `service-account*.json`, `secrets.json`, `secrets.yml`, `secrets.yaml`, `secrets.toml`, `*.tfvars`, `*.tfstate`, ainsi que tout ce que les `.gitignore` du projet ignorent.
- **Masquage des secrets** dans le récit, les commandes, leurs sorties et les diffs. Le nom de la variable est gardé, la valeur remplacée par `••••` :
  - clés au format connu (Anthropic, OpenAI, Stripe, GitHub, GitLab, npm, Hugging Face, Slack, AWS, Google, Resend), JWT, en-têtes `Bearer` et `Basic`, clés privées PEM ;
  - identifiants dans une URL (`postgres://admin:••••@hote`) ;
  - variables au nom évocateur (`API_KEY=…`, `"password": "…"`) ;
  - options de ligne de commande (`--password …`, `--token=…`, `mysql -p…`, `curl -u utilisateur:…`).

  C'est un **filet de sécurité heuristique** : un secret au format inconnu, dans une variable au nom anodin, peut passer.
- **Séquences d'échappement neutralisées.** Tout texte venu de l'agent, des commandes ou des fichiers du projet est débarrassé de ses séquences de contrôle avant d'être stocké ou affiché. Un contenu piégé ne peut donc pas changer le titre de la fenêtre, écrire dans le presse-papiers ni maquiller une ligne de la timeline.

## Variables d'environnement

| Variable | Rôle | Par défaut |
|---|---|---|
| `TELEX_HOME` | Dossier des données de telex. | `~/.telex` |
| `TELEX_TERMINAL` | Terminal à ouvrir, `none`, ou commande personnalisée ([détails](#choisir-le-terminal--telex_terminal)). | détection automatique |
| `TELEX_LAYOUT` | `none` : ne pas placer les fenêtres côte à côte (Terminal.app). | côte à côte |
| `TELEX_DEBUG` | `1` : affiche la trace complète des erreurs. | désactivé |
| `COLORTERM` | `truecolor` ou `24bit` : couleurs exactes (sinon, palette 256 couleurs). | fourni par le terminal |

Variables fixées par telex pour l'agent, à ne pas définir vous-même : `TELEX_SESSION_DIR` (dossier de la session) et `TELEX_AGENT` (`claude` ou `codex`).

## Dépannage

Les erreurs de telex tiennent sur une ligne, suivie d'une piste de résolution. Pour la trace complète : `TELEX_DEBUG=1 telex …`.

| Message | Cause | Que faire |
|---|---|---|
| `Claude Code est introuvable : la commande « claude » est absente du PATH.` | L'agent n'est pas installé, ou pas dans le `PATH`. | Installez-le et vérifiez `claude --version` (ou `codex --version`). |
| `impossible d’ouvrir un second terminal automatiquement` | Aucun terminal détecté, ou ouverture refusée. | Lancez `telex run <id>` dans un autre terminal. Sur macOS, vérifiez l'autorisation d'Automatisation. Sinon, choisissez un terminal avec `TELEX_TERMINAL`. |
| `⚠ git introuvable : …` (ligne d'état) | git n'est pas installé. | Installez git. En attendant, la timeline fonctionne sans fichiers ni diff. |
| `Instantané indisponible : git a échoué : …` | Instantané impossible (dossier illisible, disque plein…). | Lisez la raison indiquée. La timeline continue sans cet instantané. |
| `⚠ erreur telex (serveur MCP \| hook Claude Code \| instantanés) : …` | Erreur interne pendant la session. | Détails dans `~/.telex/sessions/<id>/errors.jsonl`. L'agent n'est pas bloqué. |
| `session introuvable : …` | Identifiant ou préfixe inconnu. | `telex sessions` pour la liste. |
| `préfixe ambigu : …` | Le préfixe désigne plusieurs sessions. | Donnez un identifiant plus long. |
| `identifiant de session invalide : …` | Le texte donné n'a pas la forme `AAAAMMJJ-HHMMSS-xxxx`. | Copiez l'identifiant depuis `telex sessions`. |
| `⚠ <id> ignorée : … meta.json est corrompu` | Fichier de session abîmé. | `telex rm <id>`. |
| `la session … est terminée` (`telex run`) | La session est finie. | Lancez `telex claude` ou `telex codex`. |
| `la session … est en cours : l’agent tourne encore` (`telex rm`) | L'agent de cette session tourne. | Quittez l'agent, ou ajoutez `--force`. |
| `erreur inattendue : …` | Un cas non prévu. | Relancez avec `TELEX_DEBUG=1` et [ouvrez une issue](https://github.com/hooop/telex/issues) avec la trace. |

**La timeline reste sur `Prêt`.** L'agent n'a pas encore commencé d'étape. S'il travaille déjà, vérifiez dans l'agent que le serveur MCP `telex` est connecté (commande `/mcp`) et que l'outil `timeline` est disponible.

**L'affichage est décalé ou sans couleurs.** Utilisez un terminal qui gère les 256 couleurs et une police qui contient les caractères de dessin (`▄ █ ○ ● ✓ ✕`).

## Limites connues

- **Windows** n'est pas pris en charge (telex s'appuie sur `/bin/sh`). Utilisez WSL.
- **Terminaux Linux** : l'ouverture automatique est testée par simulation ; les retours sur votre terminal sont bienvenus. En cas d'échec, `TELEX_TERMINAL` ou `telex run <id>` fonctionnent toujours.
- **Codex : les commandes exécutées ne sont pas observées.** Codex exige que chaque hook soit approuvé par l'utilisateur, et telex ne contourne pas cette protection. L'option qui le permettrait désactiverait aussi le contrôle des hooks du projet. Les fichiers, le diff et les vérifications déclarées fonctionnent normalement.
- **Le découpage dépend de l'agent.** Les consignes cadrent le travail, mais c'est l'agent qui choisit ses étapes et écrit son récit. Ajustez-les avec [`~/.telex/instructions.md`](#personnaliser-les-consignes-de-lagent).
- **Le masquage des secrets est heuristique** (voir [Protections](#protections)).
- **Les fichiers de plus de 1 Mo** n'apparaissent ni dans les fichiers concernés ni dans le diff.
- **La timeline montre le travail, pas le raisonnement** de l'agent. Elle n'affiche que ce qu'il déclare et ce que telex observe.

## Développement

```bash
git clone https://github.com/hooop/telex.git
cd telex
npm test          # quelques secondes, aucune dépendance à installer
```

| Fichier | Rôle |
|---|---|
| `bin/telex.js` | Point d'entrée : lance le CLI et affiche proprement les erreurs. |
| `src/cli.js` | Les commandes. |
| `src/adapters/index.js` | Adaptateurs Claude Code et Codex : lancement du vrai CLI avec le serveur MCP et les consignes. |
| `src/adapters/claude-hook.js` | Hook `PostToolUse` : commandes observées. |
| `src/mcp-server.js` | Serveur MCP stdio, outil `timeline` → `events.jsonl`. |
| `src/instructions.js` | Consignes et schéma de l'outil, communs aux deux agents. |
| `src/timeline.js` | Événements → lignes de timeline, recoupement. |
| `src/workspace.js` | Instantanés git fantômes, fichiers et diff par étape. |
| `src/tui.js`, `src/render.js` | Interface terminal (sans dépendance). |
| `src/terminals.js` | Ouverture du terminal de l'agent. |
| `src/store.js` | Sessions locales : lecture, écriture, états, purge. |
| `src/redact.js`, `src/sanitize.js` | Masquage des secrets, neutralisation des séquences de contrôle. |
| `src/errors.js` | Erreurs affichées à l'utilisateur et journal `errors.jsonl`. |

L'intégration continue lance les tests sur macOS et Ubuntu, avec Node 22 et 24. Les issues et les pull requests sont les bienvenues ; les messages, les commentaires et la documentation sont en français.

Historique des versions : [CHANGELOG.md](../CHANGELOG.md).

## Licence

[MIT](../LICENSE)
