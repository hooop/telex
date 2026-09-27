# Vraie TUI, données fictives, tests et diff réels sur un projet jetable.
# Réglages propres au hero : les GIFs existants gardent leur style.
# Portrait Retina : 1200 × 1752 pixels, affichés à 600 × 876 dans le README.
Output docs/demo/timeline.gif
Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 26
Set LineHeight 1.1
Set Width 1200
Set Height 1752
Set Padding 32
# 40 pixels dans le fichier Retina donnent un rayon de 20 pixels à l’affichage.
Set BorderRadius 40
# Supprimer le fond de marge par défaut : il remplirait les coins transparents.
Set MarginFill ""
Set Framerate 12
Set TypingSpeed 30ms
Set Theme { "name": "telex", "background": "#171717", "foreground": "#eeeeee", "cursor": "#ffdada", "selection": "#3a3a3a", "black": "#282a2e", "red": "#d74e6f", "green": "#31bb71", "yellow": "#d3e561", "blue": "#8056ff", "magenta": "#ed61d7", "cyan": "#04d7d7", "white": "#bfbfbf", "brightBlack": "#777777", "brightRed": "#fe5f86", "brightGreen": "#00d787", "brightYellow": "#ebff71", "brightBlue": "#9b79ff", "brightMagenta": "#ff7aea", "brightCyan": "#00fefe", "brightWhite": "#eeeeee" }

Hide
Type "node docs/demo/timeline.js" Enter
Sleep 1s
Show
Sleep 20s
Enter
Sleep 7s
Type "d"
Sleep 5s
Escape
Sleep 7s
Screenshot docs/demo/timeline.png
Sleep 2s
Hide
Type "q"
Sleep 500ms
