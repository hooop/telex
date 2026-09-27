#!/bin/sh
# Régénère les GIFs de démonstration avec VHS (brew install vhs).
#
#   sh docs/demo/render.sh            tous les GIFs
#   sh docs/demo/render.sh sessions   un seul (docs/demo/sessions.tape)
#
# Chaque scénario travaille dans un dossier jetable (voir env.sh) : ni ~/.telex ni
# l'installation globale de telex ne sont touchés. L'installation passe par le réseau.
set -e
cd "$(dirname "$0")/../.."
command -v vhs >/dev/null || { echo 'vhs est introuvable : brew install vhs' >&2; exit 1; }

if [ $# -eq 0 ]; then
  set --
  for tape in docs/demo/*.tape; do
    name=$(basename "$tape" .tape)
    [ "$name" = style ] || set -- "$@" "$name"
  done
fi

for name in "$@"; do
  echo "docs/demo/$name.gif"
  vhs --quiet "docs/demo/$name.tape"
done
