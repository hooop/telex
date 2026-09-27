# telex sessions : les sessions enregistrées et leur état.
Output docs/demo/sessions.gif
Set Height 600
Source docs/demo/style.tape
Env DEMO_FINAL_COMMAND "1"

Hide
Type "source docs/demo/env.sh install && clear" Enter
Wait
Show

Sleep 700ms
Type "npm install -g github:hooop/telex"
Sleep 400ms
Enter
Wait
Sleep 5s

Hide
Type "demo_end" Enter
Sleep 1s
