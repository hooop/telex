# Chargé en coulisses (Hide) par chaque scénario VHS, depuis la racine du dépôt.
# Tout se passe dans un dossier jetable : ~/.telex et l'installation globale ne sont jamais touchés.
#
#   source docs/demo/env.sh           telex du dépôt et sessions fictives, dans « mon-projet »
#   source docs/demo/env.sh vide      telex du dépôt, sans aucune session, dans « mon-projet »
#   source docs/demo/env.sh install   npm installe dans le dossier jetable, rien d'autre

DEMO=$(mktemp -d)
export TELEX_HOME="$DEMO/telex-home"
export BASH_SILENCE_DEPRECATION_WARNING=1

if [ "$1" = install ]; then
  # « npm install -g » écrit dans le dossier jetable ; la sortie reste celle d'une vraie installation,
  # sans la barre de progression (des caractères braille qui clignotent sous la commande).
  export npm_config_prefix="$DEMO/npm" npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
  export npm_config_progress=false
  export PATH="$DEMO/npm/bin:$PATH"
  mkdir -p "$DEMO/home" && cd "$DEMO/home"
  PLACE='~'
else
  [ "$1" = vide ] || node docs/demo/demo-home.js "$TELEX_HOME"
  mkdir -p "$DEMO/bin" "$DEMO/mon-projet"
  ln -s "$PWD/bin/telex.js" "$DEMO/bin/telex"
  export PATH="$DEMO/bin:$PATH"
  cd "$DEMO/mon-projet"
  PLACE='mon-projet'
fi

# Invite : le dossier puis un symbole, réglés dans style.tape (Env DEMO_PROMPT_*).
# Sans réglage : le dossier en gris, la flèche dans l'orange des yeux de la mascotte.
SYMBOL=${DEMO_PROMPT_SYMBOL:-❯}
SYMBOL_COLOR=${DEMO_PROMPT_COLOR:-#FF9855}
PLACE_COLOR=${DEMO_PLACE_COLOR:-#8A8A8A}
# Le curseur n'apparaît qu'avec l'invite : elle le réaffiche (\e[?25h), et il est caché
# pendant qu'une commande tourne (voir demo_before).
# Invite finale (DEMO_FINAL_COMMAND) : après la N-ième commande, le symbole est écrit en
# texte invisible et le curseur reste caché. Le GIF se termine sur la sortie, et VHS
# trouve toujours l'invite dans le texte du terminal pour ses actions Wait.
if [ -n "$ZSH_VERSION" ]; then
  PROMPT=$'%{\e[?25h%}'"%F{$PLACE_COLOR}$PLACE%f %F{$SYMBOL_COLOR}${SYMBOL//\%/%%}%f "
  DEMO_HIDDEN_PROMPT=$'%{\e[8m%}'"${SYMBOL//\%/%%}"$'%{\e[0m\e[?25l%}'
else
  rgb() { printf '%d;%d;%d' "0x$(echo "$1" | cut -c2-3)" "0x$(echo "$1" | cut -c4-5)" "0x$(echo "$1" | cut -c6-7)"; }
  PS1="\[\e[?25h\e[38;2;$(rgb "$PLACE_COLOR")m\]$PLACE\[\e[0m\] \[\e[38;2;$(rgb "$SYMBOL_COLOR")m\]$SYMBOL\[\e[0m\] "
  DEMO_HIDDEN_PROMPT="\[\e[8m\]$SYMBOL\[\e[0m\e[?25l\]"
fi

# Lignes vides autour de chaque sortie, pour la lisibilité (DEMO_BLANK_LINES, 1 par défaut) :
# une après la commande tapée, une avant l'invite suivante (sauf la première, et après clear).
# npm imprime déjà une ligne vide avant son bilan : on n'en ajoute pas une seconde.
DEMO_BLANK=${DEMO_BLANK_LINES:-1}
DEMO_COUNT=0
demo_before() {
  case "$1" in demo_end|demo_prompt) return 0 ;; esac
  DEMO_COUNT=$((DEMO_COUNT + 1))
  printf '\033[?25l' # curseur caché pendant la commande : l'invite suivante le réaffiche
  [ "$DEMO_BLANK" = 1 ] || return 0
  case "$1" in npm\ *|clear) ;; *) echo ;; esac
}
demo_prompt() {
  if [ -n "$DEMO_FINAL_COMMAND" ] && [ "$DEMO_COUNT" -ge "$DEMO_FINAL_COMMAND" ]; then
    PS1=$DEMO_HIDDEN_PROMPT # invisible : pas de ligne vide avant, elle prendrait de la hauteur pour rien
  elif [ "$DEMO_BLANK" = 1 ] && [ -n "$DEMO_STARTED" ]; then
    echo
  fi
  DEMO_STARTED=1
  DEMO_AT_PROMPT=1
}
clear() { command clear; DEMO_STARTED=; }
if [ -n "$ZSH_VERSION" ]; then
  preexec() { demo_before "$1"; }
  precmd() { demo_prompt; }
else
  # bash 3.2 (macOS) n'a pas PS0 : le piège DEBUG précède chaque commande, et
  # DEMO_AT_PROMPT limite l'effet à la première commande après l'invite.
  demo_debug() { [ -n "$DEMO_AT_PROMPT" ] || return 0; DEMO_AT_PROMPT=; demo_before "$BASH_COMMAND"; }
  trap demo_debug DEBUG
  PROMPT_COMMAND=demo_prompt
fi

# Appelé en coulisses à la fin de chaque scénario.
demo_end() {
  for pid in $(find "$TELEX_HOME/sessions" -name agent.pid -exec cat {} + 2>/dev/null); do kill -- "-$pid" 2>/dev/null; done
  cd / && rm -rf "$DEMO"
}
