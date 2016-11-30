@echo off
call forever stop discord-bot-radio.js
forever start discord-bot-radio.js
forever list

:: start.bat by MLPVC-BOT
:: https://github.com/ponydevs/MLPVC-BOT