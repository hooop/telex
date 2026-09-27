# Démos du README

Les GIFs sont enregistrés avec [VHS](https://github.com/charmbracelet/vhs).
Il faut VHS, ses prérequis et la police JetBrains Mono sur la machine de rendu.

## Démo principale

Depuis la racine du dépôt :

```bash
sh docs/demo/render.sh timeline
```

`timeline.tape` enregistre la vraie interface de Telex : progression, erreur,
correction, détails, diff et bilan. Le scénario construit une récupération de mot
de passe : stockage des jetons sous forme de hash, expiration à 15 minutes,
réponse publique identique pour les adresses connues ou inconnues, transport
e-mail simulé, formulaire et changement du mot de passe.

Un vrai test révèle qu’un lien fonctionne encore après usage. La correction
supprime le jeton et fait passer les huit tests. La vue Détails montre le récit,
le fichier modifié et la commande exécutée ; le Diff montre ensuite les lignes
ajoutées. Aucun événement ne change la sélection pendant ces deux vues.
Le bilan précise que la livraison d’un véritable e-mail reste à vérifier.

`password-reset.fixture.js` contient les sources du petit projet de démonstration
et ses tests. Ce code illustre le scénario ; ce n’est pas un service d’authentification
destiné à être déployé. Une horloge injectable permet de tester les 15 minutes
d’expiration sans attente réelle.

`timeline.js` fournit ce scénario fictif dans un dossier
temporaire, lance de vrais tests sur ce petit projet et crée de vrais instantanés
pour le diff. Aucun agent n’est lancé et aucune requête réseau n’est nécessaire.
Le dossier temporaire est supprimé à la fermeture de la démo.

Le rendu produit `timeline.gif` et une capture fixe `timeline.png`, également
accessible depuis le README. Les réglages de cette démo sont dans son fichier
`.tape` ; ils ne modifient pas ceux des animations existantes.

La fenêtre adopte un format portrait : **1200 × 1752 pixels**, affichés à
**600 × 876 pixels** dans le README. Ce rapport ×2 garde le texte net sur un écran
Retina. La police et les marges sont réglées à cette résolution. La fenêtre n’a
pas de barre de titre ; son rayon de 40 pixels donne des coins de 20 pixels à l’affichage.

`MarginFill ""` garde les coins transparents sur fond clair ou sombre. Pour réduire
le poids de cet export transparent sans perte, optimisez le GIF avec Gifsicle après VHS :

```bash
gifsicle -O3 --batch docs/demo/timeline.gif
```

## Éditeur et autres animations

```bash
node docs/demo/editor.js
```

Ouvrez l’adresse locale indiquée par l’éditeur. Il permet de régler les scénarios
VHS et de prévisualiser leurs rendus. Le style partagé des animations historiques
reste dans `style.tape`.

```bash
sh docs/demo/render.sh install  # régénérer l’installation
```

La démo d’installation télécharge le paquet dans un dossier jetable. Elle utilise
le réseau et ne touche pas à l’installation globale de Telex.
