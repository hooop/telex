# Installation depuis GitHub. C'est une vraie installation, dans un dossier jetable
# (voir env.sh) ; l'attente du téléchargement est écourtée à l'image.
Output docs/demo/install.gif
Set Height 780
Source docs/demo/style.tape
Env DEMO_FINAL_COMMAND "2"

Hide
Type "source docs/demo/env.sh install && clear" Enter
Wait
Show

Sleep 700ms
Type "npm install -g github:hooop/telex"
Sleep 500ms
Enter
Sleep 500ms
Hide
Wait
Show
Type "telex --version"
Sleep 500ms
Enter
Sleep 2s

Hide
Type "demo_end" Enter
Sleep 1s
