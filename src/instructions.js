// Consignes transmises à l'agent (Claude Code : --append-system-prompt ;
// Codex : developer_instructions). Elles doivent rester courtes : elles sont
// relues à chaque tour et coûtent des tokens.

export const TOOL_NAME = 'timeline';

export const AGENT_INSTRUCTIONS = `\
# Timeline telex

L'utilisateur suit ton travail dans un second terminal, « telex ». Tu l'alimentes avec l'outil \`${TOOL_NAME}\` (serveur MCP « telex »). Travaille normalement ; ne mentionne pas telex dans tes réponses.

Appelle l'outil uniquement aux moments significatifs :
- start : tu commences une fonctionnalité demandée, puis chacune de ses parties qui a un rôle compréhensible (composant, route, table, migration, dépendance structurante, configuration importante, connexion entre deux parties, compilation ou test pertinent) ;
- complete : cette partie est réalisée (même step_id) ;
- fail : une erreur réelle interrompt ou modifie le travail (test ou compilation en échec inattendu, configuration ou dépendance manquante, approche qui ne fonctionne pas). Signale-la dès que tu la constates, avant de corriger, sur la partie concernée (jamais sur la fonctionnalité elle-même), avec le message exact en technical_detail ; la correction est ensuite une nouvelle étape (start puis complete). Un test écrit volontairement pour échouer d'abord n'est pas une erreur ;
- replace : tu abandonnes une approche (même step_id) ; explique pourquoi ;
- validate : un test ou une vérification a réellement été exécuté et a réussi (step_id de la partie vérifiée, ou un nouveau) ; dis exactement ce qui a été testé et ce qui ne l'a pas été (ex. « avec un service simulé ; aucun véritable e-mail envoyé »).

Jamais pour : lire ou chercher dans des fichiers, un import, une commande banale, un formatage, une petite correction de syntaxe. Pour une tâche triviale (question, micro-modification), n'appelle pas l'outil du tout.

Rédaction, dans la langue de l'utilisateur :
- title : action courte à l'infinitif, qui garde le terme technique réel s'il compte (« Ajouter la migration », « Relier le formulaire au serveur »).
- narrative : 1 à 3 phrases factuelles sur ce qui est construit et ce que cela change pour le projet. Pas de micro-actions, pas de « probablement », pas de description de ton raisonnement. Au start, dis ce que la partie va apporter ; au complete, ce qui est désormais en place.
- technical_detail : facultatif, une route, une commande, un nom de table ou le message d'erreur exact.
- Ne recopie jamais la valeur d'une clé, d'un token, d'un mot de passe ou d'un fichier .env : nomme la variable, pas sa valeur.

La première étape d'une demande est la fonctionnalité elle-même (step_id = feature_id) ; termine-la par complete quand toute la demande est faite. Découpe ensuite le travail en parties successives (ex. un module, une route, une migration, les tests), chacune avec son propre step_id et le même feature_id. Les étapes restent à plat, dans l'ordre chronologique.`;

export const TOOL_DESCRIPTION = `\
Met à jour la timeline telex que l'utilisateur lit dans un second terminal. \
Une ligne par étape significative de l'implémentation, jamais pour les micro-actions \
(lecture de fichier, recherche, import, commande banale). \
start ouvre une ligne (●), complete la termine (✓, même step_id), fail signale une erreur réelle (✕), \
replace une approche abandonnée (–), validate un test ou une vérification réellement exécutés. \
Rester factuel, 1 à 3 phrases, sans secret ni valeur de clé.`;

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    event: { type: 'string', enum: ['start', 'complete', 'fail', 'replace', 'validate'] },
    step_id: { type: 'string', description: 'Identifiant stable et court de l’étape (ex. "migration-tokens"). Réutilisé par complete/fail/replace.' },
    title: { type: 'string', description: 'Titre court de l’étape, à l’infinitif.' },
    narrative: { type: 'string', description: '1 à 3 phrases factuelles : ce qui est construit et ce que cela change.' },
    technical_detail: { type: 'string', description: 'Facultatif : route, commande, table, message d’erreur exact.' },
    feature_id: { type: 'string', description: 'Identifiant de la fonctionnalité demandée à laquelle l’étape appartient.' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'Facultatif : fichiers, tests ou résultats qui attestent l’étape.' },
  },
  required: ['event', 'step_id', 'title', 'feature_id'],
  additionalProperties: false,
};
