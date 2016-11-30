var Discord = require('discord.js'),
    config = require('./config'),
    token = config.TOKEN,
    bot = new Discord.Client(),
    server,
    version,
    exec,
    stream = null,
    meta = null;

/* VERSION */
function getVersion(callback) {
    exec = exec || require('child_process').exec;

    exec('git rev-parse --short=4 HEAD', function (error, version) {
        if (error) {
            console.log('Error getting version', error);
            return callback('unknown');
        }

        callback(version.trim());
    });
}

/* BOT EVENTS */
bot.on('ready', function () {
    online();
    console.log('I am ready!');
    getVersion(function (v) {
        version = v;
        bot.user.setGame('version ' + version);

        if (config.DEBUG) bot.channels.find('id', config.TEXT_CH).sendMessage('I am ready, running version `' + version + '`!');
    });

    console.log(bot.guilds);

    if (!bot.guilds.exists('id', config.SERVER_ID)) {
        console.log('Bot is not connected to the selected server!');
        process.exit();
    }

    server = bot.guilds.find('id', config.SERVER_ID);

    playRadio();
});

function playRadio() {
    const streamOptions = {volume: 0.05};

    var channel = server.channels.find('id', config.VOICE_CH);

    channel.join().then(function (connection) {
            var url = config.STREAM;

            const icy = require('icy');

            icy.get(url, function (res) {

                console.log(res.headers);

                res.on('metadata', function (metadata) {
                    meta = icy.parse(metadata);
                    bot.user.setGame(meta.StreamTitle);
                });

                connection.playStream(res, streamOptions);
            });


            stream = connection;
        })
        .catch(console.error);
}

function onMessage(message) {
    if (message.author.id == bot.user.id) {
        return;
    }

    if (message.channel.type == 'group') {
        return;
    }

    function handleCommand() {
        var match = /^[\/!]([a-zA-Z]+).*$/.exec(message.content);

        if (message.channel.type == 'dm') {
            match = /^[\/!]?([a-zA-Z]+).*$/.exec(message.content);
        }

        if (match) {
            var args = message.content.split(' ').splice(1);

            processCommand(message, match[1].toLowerCase(), args);
        }
    }

    if (server.channels.exists('id', message.channel.id)) {
        handleCommand();
    } else {
        if (server.members.exists('id', message.author.id)) {
            handleCommand();
        } else {
            return message.channel.sendMessage('You have to be member ' + server.name + '!');
        }
    }
}

bot.on('message', onMessage);

bot.on('messageUpdate', function (oldMessage, newMessage) {
    if (typeof newMessage.author === 'undefined')
        return;

    onMessage(newMessage);
});

function respond(message, response, mention, pm) {
    if (typeof mention === 'undefined') {
        mention = true;
    }

    if (typeof pm === 'undefined') {
        pm = false;
    }

    if (pm) {
        message.author.sendMessage(response);
    } else {
        if(mention) {
            message.reply(response);
        } else {
            message.channel.sendMessage(response);
        }
    }
}

/* COMMAND PROCESSING */
function processCommand(message, command, args) {
    switch (command) {
        case 'radio':
        case 'rv':
            (function () {
                respond(message, "Running DiscordRadio.de by DerAtrox, Version: `" + version + "`.\nAktuellster Commit: https://github.com/DerAtrox/DiscordRadio/commit/" + version);
            })();
            break;
        case 'nowplaying':
        case 'np':
            (function () {
                if(stream == null) {
                    respond(message, 'Der Stream ist aktuell nicht aktiv!', false);
                    return;
                }

                if(meta == null) {
                    respond(message, 'Keine Metadaten gefunden!', false);
                    return;
                }

                var metaS = meta.StreamTitle.split(' - ');
                if(metaS.length == 2) {
                    respond(message, 'Derzeit läuft **' + metaS[1] + '** von **' + metaS[0] + '**.', false);
                } else {
                    respond(message, 'Derzeit läuft **' + meta + '**.', false);
                }
            })();
            break;
    }
}

/* GENERAL APPLICATION STUFF */
process.on('exit', idle);

process.on('SIGINT', function () {
    idle();
    process.exit();

});

function idle() {
    bot.user.setStatus('idle');
}

function online() {
    bot.user.setStatus('online');
}

/* LOGIN */
bot.login(token);

