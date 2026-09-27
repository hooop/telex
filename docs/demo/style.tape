# Réglages communs à tous les GIFs, inclus par chaque scénario (Source).
# Se modifie à la main ou avec l'éditeur : node docs/demo/editor.js

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 36
Set LineHeight 1.1
Set LetterSpacing 2
Set Width 1160
Set Padding 40
Set Margin 0
Set MarginFill "#FFFFFF"
Set BorderRadius 30
Set WindowBar Colorful
Set WindowBarSize 108
Set TypingSpeed 60ms
Set Framerate 30
Set LoopOffset 0%
Set CursorBlink true
Set WaitPattern /▸\s*$/
Set WaitTimeout 60s
Set Theme { "name": "personnalisé", "background": "#171717", "foreground": "#DDDDDD", "cursor": "#FFDAD8", "selection": "#3A3A3A", "black": "#282A2E", "red": "#D74E6F", "green": "#31BB71", "yellow": "#D3E561", "blue": "#8056FF", "magenta": "#ED61D7", "cyan": "#04D7D7", "white": "#BFBFBF", "brightBlack": "#4D4D4D", "brightRed": "#FE5F86", "brightGreen": "#00D787", "brightYellow": "#EBFF71", "brightBlue": "#9B79FF", "brightMagenta": "#FF7AEA", "brightCyan": "#00FEFE", "brightWhite": "#E6E6E6" }

# Invite de commande (lue par env.sh) : symbole, sa couleur, couleur du dossier,
# lignes vides autour de chaque sortie (1) ou non (0).
Env DEMO_PROMPT_SYMBOL "▸"
Env DEMO_PROMPT_COLOR "#FFDAD8"
Env DEMO_PLACE_COLOR "#444444"
Env DEMO_BLANK_LINES "1"

# Rendu ×2 (Retina) : les tailles ci-dessus et les hauteurs des scénarios sont doublées,
# le README affiche les GIFs à moitié. L'éditeur montre les tailles d'affichage.
Env DEMO_SCALE "2"
