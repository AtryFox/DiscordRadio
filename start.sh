#! /bin/bash
git reset HEAD --hard
git pull
forever list | grep discord-bot-radio.js && forever stop discord-bot-radio.js
forever start discord-bot-radio.js
forever list

# start.sh by MLPVC-BOT
# https://github.com/ponydevs/MLPVC-BOT