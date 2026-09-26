# telex

[![tests](https://github.com/hooop/telex/actions/workflows/tests.yml/badge.svg)](https://github.com/hooop/telex/actions/workflows/tests.yml)
[![licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

**Le second terminal qui explique, en direct, ce que Claude Code ou Codex est en train de construire.**

Vous travaillez avec votre agent comme d'habitude, dans sa propre fenêtre. À côté, telex affiche une timeline courte et factuelle : quelle partie est en cours, ce qui vient d'être terminé, ce qui a échoué puis été corrigé, ce qui a réellement été testé. Pour chaque étape, vous pouvez ouvrir les fichiers modifiés, le diff et les commandes exécutées.

```text
 ----------+-----------------------------------------------------------------
   ▄████▄  | T E L E X                                     ● EN DIRECT  11:08
  ▐ █  █ ▌ |-----------------------------------------------------------------
   ▀████▀  | PROJET ▸ mon-projet   AGENT ▸ Claude Code
 ----------+-----------------------------------------------------------------

  14:32:04  ◒  Ajouter la réinitialisation du mot de passe
-----------------------------------------------------------------------------
  14:32:20  ✓  Examiner l’authentification existante
-----------------------------------------------------------------------------
  14:33:10  ✓  Créer la table des tokens
-----------------------------------------------------------------------------
  14:36:00  ✕  Configurer l’accès à Resend
-----------------------------------------------------------------------------
  14:36:30  ✓  Corriger la configuration de Resend
-----------------------------------------------------------------------------
  14:41:03  –  Conserver les tokens en mémoire
-----------------------------------------------------------------------------
  14:41:16  ✓  Conserver les tokens dans la base de données
-----------------------------------------------------------------------------
› 14:42:30  ◒  Relier le formulaire au serveur
-----------------------------------------------------------------------------
  étape 8/8 · en cours depuis 42 s
-----------------------------------------------------------------------------
  Une route reçoit l’adresse e-mail et vérifie qu’elle correspond à un compte.
  POST /forgot-password

  ↵ détails   D diff   T tests   Q quitter                    suivi en direct
```

- **Aucune clé API.** C'est l'agent lui-même qui écrit la timeline, via un petit outil local. Vous utilisez votre abonnement habituel.
- **Aucune modification de votre configuration.** Tout est passé en options au lancement de l'agent. `~/.claude`, `~/.codex` et votre projet ne sont jamais modifiés.
- **Des faits vérifiables.** Les fichiers et le diff de chaque étape viennent d'instantanés pris par telex, pas du récit de l'agent. Une vérification déclarée alors que le dernier test a échoué est signalée.
- **Local et privé.** Tout reste dans `~/.telex`. Les secrets sont masqués et les fichiers sensibles ne sont jamais copiés.

## Sommaire

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Commandes](#commandes)
- [Lire l'écran](#lire-lécran)
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
4. Quand vous quittez l'agent, la session se termine : l'en-tête passe à `SESSION TERMINÉE` et un bilan s'affiche.

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

## Lire l'écran

### L'en-tête

```text
 ----------+-----------------------------------------------------------------
   ▄████▄  | T E L E X                                     ● EN DIRECT  11:08
  ▐ █  █ ▌ |-----------------------------------------------------------------
   ▀████▀  | PROJET ▸ mon-projet   AGENT ▸ Claude Code
 ----------+-----------------------------------------------------------------
```

| Élément | Signification |
|---|---|
| La mascotte | Cligne des yeux tant que la session est en direct. Elle disparaît sur un terminal étroit. |
| `T E L E X` | Le logo, tapé lettre par lettre à l'ouverture. |
| `● EN DIRECT` | L'agent tourne. Le voyant pulse. |
| `■ SESSION TERMINÉE` | L'agent s'est arrêté normalement. |
| `■ SESSION INTERROMPUE` | L'agent a disparu sans que la fin soit enregistrée (voir [Fonctionnement](#détection-des-sessions-interrompues)). |
| `11:08` | Temps écoulé depuis le début de la session (`MM:SS`, ou `H:MM:SS` au-delà d'une heure). En fin de session, sa durée totale. |
| `PROJET ▸` | Nom du dossier dans lequel `telex claude` ou `telex codex` a été lancé. |
| `AGENT ▸` | Claude Code ou Codex. |

Sur un terminal étroit, le chrono puis l'état s'effacent pour laisser la place au texte.

### Les lignes de la timeline

```text
  14:36:00  ✕  Configurer l’accès à Resend
  │         │  └ titre de l'étape, écrit par l'agent
  │         └ statut
  └ heure de DÉBUT de l'étape (heure locale)
```

Une ligne naît quand l'agent **commence** une étape. Son statut change ensuite **sur place**, et elle ne disparaît jamais. Les étapes futures ne sont jamais affichées à l'avance.

| Symbole | Statut | Événement de l'agent | Signification |
|---|---|---|---|
| `◐ ◓ ◑ ◒` (animé) | en cours | `start` | L'étape a commencé. Hors de l'interface interactive (`--print`), le symbole est `●`. |
| `✓` | réalisée | `complete` | L'étape est terminée. Cela ne veut pas dire qu'elle a été testée. |
| `✓` | vérification exécutée | `validate` | Un test ou une vérification a réellement été lancé et a réussi. Le récit dit exactement ce qui a été testé. |
| `✕` | erreur | `fail` | Une erreur réelle a interrompu ou modifié le travail. La ligne reste visible après la correction, qui forme une nouvelle ligne. |
| `–` | approche remplacée | `replace` | L'agent a abandonné une approche. Le texte est atténué, et le récit dit pourquoi. |

Les deux `✓` se distinguent dans le panneau d'aperçu et dans les détails (`réalisée` ou `vérification exécutée`).

**Couleurs** (sur un terminal 256 couleurs) : bleu pâle pour une étape réalisée ou vérifiée, rose pâle pour une erreur ou un fait contradictoire, crème pour une étape en cours, les touches et la sélection. Les éléments secondaires sont atténués.

**La première ligne** d'une demande est la fonctionnalité elle-même (« Ajouter la réinitialisation du mot de passe »). Elle reste en cours jusqu'à ce que l'agent ait terminé toute la demande. Les lignes suivantes sont ses parties, dans l'ordre chronologique, sans imbrication.

| Repère | Signification |
|---|---|
| `›` en début de ligne | Étape sélectionnée (celle que détaillent l'aperçu et les vues). |
| `Prêt` | Aucune étape encore : l'agent n'a pas commencé à travailler. |
| `↓ 2 nouvelles étapes — [Fin] pour suivre` | Vous avez remonté la liste et de nouvelles étapes sont arrivées. `Fin` revient en bas et reprend le suivi en direct. |
| `Bilan : …` | En fin de session : nombre d'étapes réalisées, de vérifications exécutées, d'erreurs, d'approches remplacées et d'étapes non terminées. |

### Le panneau d'aperçu

En bas de la liste, l'étape sélectionnée est résumée :

```text
-----------------------------------------------------------------------------
  étape 5/8 · réalisée · 19 s
-----------------------------------------------------------------------------
  Le projet recherche maintenant la clé sous le bon nom : RESEND_API_KEY.
```

| Élément | Signification |
|---|---|
| `étape 5/8` | Position de l'étape sélectionnée dans la timeline. |
| `réalisée · 19 s` | Statut et durée (du début à la fin de l'étape). |
| `en cours depuis 42 s` | Pour une étape en cours, le temps écoulé depuis son début. |
| Texte normal | Le récit de l'agent : ce qui est construit et ce que cela change. |
| Texte atténué | Le détail technique : route, commande, table, message d'erreur exact. |
| Texte rose : `Fait observé : la dernière commande de vérification a échoué (npm test).` | Le [recoupement](#recoupement-des-faits) : l'agent a déclaré l'étape réalisée ou vérifiée, mais le dernier test ou la dernière compilation lancés pendant l'étape a échoué. |
| `… suite dans les détails [↵]` | Le texte ne tient pas dans le panneau. |
| `Pas de récit pour cette étape.` | L'agent n'a donné que le titre. |

### La ligne d'état et le menu

```text
  ⚠ erreur telex (instantanés) : git introuvable : les fichiers et le diff par étape sont indisponibles.
  ↵ détails   D diff   T tests   Q quitter                    suivi en direct
```

- **La ligne d'état** (au-dessus du menu) n'apparaît qu'en cas de problème. Elle affiche la dernière erreur interne de telex : instantané impossible, erreur du serveur MCP ou du hook, fichier illisible. `Échap` l'efface. Voir [Dépannage](#dépannage).
- **Le menu** liste les actions possibles. Le bouton **en surbrillance** est celui qu'exécute `Entrée` ; les flèches `←` `→` la déplacent. Une action grisée n'est pas disponible (aucune étape sélectionnée). Si le terminal est étroit, seules les touches restent affichées.
- **À droite**, `suivi en direct` signifie que la sélection suit automatiquement la dernière étape. Dans les vues détaillées, `lignes 1–24 / 40` indique la position de défilement.

### La vue détails `[↵]`

```text
  Corriger la configuration de Resend
  ✓ réalisée   début 14:36:30   fin 14:36:49   (19 s)

  Le projet recherche maintenant la clé sous le bon nom : RESEND_API_KEY.

  Fichiers concernés
  modifié   src/mail.js

  Commandes observées
  14:36:40  ✓  npm test -- reset

  Preuves citées par l’agent
  · src/mail.js
  · npm test -- reset

  Origine
  Titre et récit : écrits par Claude Code via l’outil timeline. Fichiers :
  instantanés pris par telex à chaque événement. Commandes : hook
  PostToolUse de Claude Code.

  Événements bruts [R] afficher
```

| Section | Contenu | Qui le produit |
|---|---|---|
| Titre, statut, heures | Début, fin et durée de l'étape. | telex (horodatage à la réception) |
| Récit | Ce que l'agent dit avoir fait. | l'agent |
| `Technique` | Le détail technique, s'il y en a un. | l'agent |
| `Fichiers concernés` | Fichiers `ajouté`, `modifié` ou `supprimé` entre le début et la fin de l'étape. Pour une étape en cours, jusqu'au dernier instantané. | telex (instantanés) |
| `Commandes observées` | Commandes shell réellement exécutées pendant l'étape, avec `✓` (réussie) ou `✕` (échec). Claude Code seulement. | telex (hook) |
| `Preuves citées par l’agent` | Fichiers, tests ou résultats que l'agent cite à l'appui. Ils sont **déclarés**, pas vérifiés. | l'agent |
| `Origine` | D'où vient chaque information. | telex |
| `Événements bruts [R]` | Les événements reçus pour cette étape, en JSON. `R` les affiche ou les masque. | l'agent, tels que reçus |

Messages possibles dans `Fichiers concernés` :

| Message | Signification |
|---|---|
| `Aucun fichier modifié entre le début et la fin de l’étape.` | L'étape n'a rien changé (examen, diagnostic…). |
| `Aucun fichier modifié depuis l’événement précédent.` | Pour une vérification isolée (sans durée propre), la comparaison part de l'événement précédent. |
| `Étape en cours : les fichiers seront comparés à sa fin.` | Pas encore d'instantané postérieur au début. |
| `Instantané indisponible : …` | L'instantané a échoué ; la raison suit (git absent, erreur git…). |

### La vue diff `[D]`

```text
  Diff : Corriger la configuration de Resend

  diff --git a/src/mail.js b/src/mail.js
  index 7418200..6aa9b29 100644
  --- a/src/mail.js
  +++ b/src/mail.js
  @@ -1,6 +1,6 @@
   import { Resend } from 'resend';

  -const resend = new Resend(process.env.RESEND_KEY);
  +const resend = new Resend(process.env.RESEND_API_KEY);
```

Le diff est calculé entre l'instantané du début et celui de la fin de l'étape : lignes ajoutées en bleu pâle, retirées en rose, repères `@@` en crème. Les secrets qu'il contiendrait sont masqués, et les fichiers exclus des instantanés (fichiers sensibles, fichiers de plus de 1 Mo) n'y figurent pas.

### La vue tests `[T]`

```text
  Tests et compilations

  Vérifications déclarées par l’agent
  14:41:16  ✓  Conserver les tokens dans la base de données
               Le test passe avec un service d’e-mail simulé. Aucun véritable
               e-mail n’a encore été envoyé.

  Pendant « Configurer l’accès à Resend »
  14:36:05  ✕  npm test -- reset
               Error: RESEND_API_KEY is not defined
                   at sendResetEmail (src/mail.js:12:11)
               # fail 1

  Dans le reste de la session
  14:36:40  ✓  npm test -- reset
               # tests 7
               # pass 7
               # fail 0
```

| Section | Contenu |
|---|---|
| `Vérifications déclarées par l’agent` | Toutes les lignes `validate` de la session, avec le récit de ce qui a été testé. |
| `Pendant « … »` | Tests et compilations observés pendant l'étape sélectionnée, avec les 12 dernières lignes de leur sortie. |
| `Dans le reste de la session` | Les autres tests et compilations. |

Une commande est considérée comme un test ou une compilation si elle contient l'un de ces mots : `test`, `jest`, `vitest`, `mocha`, `pytest`, `unittest`, `rspec`, `phpunit`, `go test`, `cargo test`, `cargo build`, `tsc`, `typecheck`, `lint`, `eslint`, `build`, `compile`, `make`, `gradle`, `mvn`, `swift build`, `swift test`, `xcodebuild`, `playwright`, `cypress`.

Avec Codex, seule la section `Vérifications déclarées par l’agent` est remplie (voir [Limites connues](#limites-connues)).

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

Les consignes (dans [`src/instructions.js`](src/instructions.js)) font environ 3 700 caractères, soit de l'ordre de 1 000 tokens par tour. S'y ajoutent quelques appels d'outil par fonctionnalité, sur votre abonnement habituel. Elles demandent à l'agent d'ouvrir une ligne par partie vérifiable du travail, jamais pour une micro-action (lecture de fichier, recherche, import), de rester factuel et de ne jamais recopier la valeur d'un secret.

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

### Détection des sessions interrompues

Le script de lancement enregistre son numéro de processus (`agent.pid`). Quand vous fermez la fenêtre de l'agent, il reste en vie juste le temps d'enregistrer la fin de session, avec le code de sortie de l'agent. Si le processus disparaît sans rien enregistrer (processus tué, machine arrêtée…), telex s'en aperçoit : la timeline ouverte passe à `SESSION INTERROMPUE` en quelques secondes, et `telex sessions` l'affiche comme `■ interrompue`.

## Terminaux pris en charge

Sans réglage, telex essaie dans cet ordre :

| Terminal | Condition | Ouverture |
|---|---|---|
| tmux | vous êtes dans tmux (tous systèmes) | un panneau à droite, dans le dossier du projet |
| iTerm2 | macOS, lancé depuis iTerm2 | une nouvelle fenêtre |
| WezTerm | lancé depuis WezTerm | une nouvelle fenêtre (`wezterm cli spawn`) |
| Terminal | macOS | une nouvelle fenêtre de Terminal.app |
| Linux | session graphique (`DISPLAY` ou `WAYLAND_DISPLAY`) | le premier trouvé parmi `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `kitty`, `alacritty`, `foot`, `xterm` |

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

**L'affichage est décalé ou sans couleurs.** Utilisez un terminal qui gère les 256 couleurs et une police qui contient les caractères de dessin (`▄ █ ◐ ✓ ✕`).

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

Historique des versions : [CHANGELOG.md](CHANGELOG.md).

## Licence

[MIT](LICENSE)
