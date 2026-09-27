# telex prune : lister les vieilles sessions, puis les supprimer.
Output docs/demo/prune.gif
Set Height 1080
Source docs/demo/style.tape

Hide
Type "source docs/demo/env.sh && clear" Enter
Wait
Show

Sleep 700ms
Type "telex prune"
Sleep 400ms
Enter
Wait
Sleep 2.5s
Type "telex prune --yes"
Sleep 400ms
Enter
Wait
Sleep 5s

Hide
Type "demo_end" Enter
Sleep 1s
