var Discord = require('discord.js'),
    config = require('./config'),
    token = config.TOKEN,
    bot = new Discord.Client(),
    server,
    version,
    exec,
    vconnection = null,
    stream = null,
    meta = null,
    endmanual = false,
    prTimeout = false;

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
    console.log(getDateTime() + 'I am ready!');
    getVersion(function (v) {
        version = v;
        bot.user.setGame('version ' + version);

        if (config.DEBUG) bot.channels.find('id', config.TEXT_CH).sendMessage('I am ready, running version `' + version + '`!');
    });

    if (!bot.guilds.exists('id', config.SERVER_ID)) {
        console.log('Bot is not connected to the selected server!');
        process.exit();
    }

    server = bot.guilds.find('id', config.SERVER_ID);

    playRadio();
});

function playRadio() {
    endStream()

    const streamOptions = {volume: 0.1};

    var channel = server.channels.find('id', config.VOICE_CH);


    channel.join().then(function (connection) {
        console.log(getDateTime() + 'Voice connect');

        connection.on('disconnect', function () {
            console.log(getDateTime() + 'Voice disconnect');

            endStream();
            setTimeout(function () {
                playRadio();
            }, 2000);
        });

        connection.on('error', function (err) {
            console.log(getDateTime() + 'Voice error ' + err);
        });

        const icy = require('icy');
        const url = require('url');

        var opts = url.parse(config.STREAM);
        opts.headers = {'User-Agent': config.USER_AGENT};

        icy.get(opts, function (res) {

            if (config.DEBUG) console.log(res.headers);

            res.on('metadata', function (metadata) {
                meta = icy.parse(metadata);
                bot.user.setGame(meta.StreamTitle);
            });

            stream = connection.playStream(res, streamOptions);

            stream.on('start', function () {
                console.log(getDateTime() + 'Stream started');
                endmanual = false;
            });

            stream.on('end', function () {
                if (endmanual) {
                    console.log(getDateTime() + 'Stream ended');
                    endmanual = false;
                } else {
                    console.log(getDateTime() + 'Stream ended, restarting');
                    setTimeout(function () {
                        playRadio();
                    }, 2000);
                }
            });

            stream.on('error', function (error) {
                console.log(getDateTime() + 'Stream error ');
                console.log(error);
            });
        });

        vconnection = connection;
    })
        .catch(console.error);
}

function endStream() {
    try {
        if (stream != null) {
            endmanual = true;
            stream.end();
        }
    } catch (e) {
        console.log('Could not end stream ' + e);
    }
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
        if (mention) {
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
                respond(message, "Running DiscordRadio by DerAtrox, Version: `" + version + "`.\nAktuellster Commit: https://github.com/DerAtrox/DiscordRadio/commit/" + version);
            })();
            break;
        case 'nowplaying':
        case 'np':
            (function () {
                if (vconnection == null) {
                    respond(message, 'Der Stream ist aktuell nicht aktiv!', false);
                    return;
                }

                if (meta == null) {
                    respond(message, 'Keine Metadaten gefunden!', false);
                    return;
                }

                var text;

                var metaS = meta.StreamTitle.split(' - ');
                if (metaS.length == 2) {
                    text = '🎶 Derzeit läuft **' + metaS[1] + '** von **' + metaS[0] + '**.';
                } else {
                    text = '🎶 Derzeit läuft **' + meta + '**.';
                }

                var YouTube = require('youtube-node');

                var youTube = new YouTube();

                youTube.setKey(config.YOUTUBE_KEY);

                youTube.addParam('type', 'video');
                youTube.search(meta.StreamTitle.replace(' - ', ' '), 1, function (error, result) {
                    if (error) {
                        console.log(error);
                    }
                    else {
                        if (result.items.length == 1) {
                            text += "\n\nAuf YouTube anhören: https://www.youtube.com/watch?v=" + result.items[0].id.videoId;
                            if (config.DEBUG) console.log(JSON.stringify(result, null, 2));
                        }
                    }

                    return respond(message, text, false);
                });
            })();
            break;
        case 'playradio':
        case 'pr':
            (function () {
                if(!server.members.exists('id', message.author.id)) {
                    console.log(getDateTime() + '!pr: Nutzer nicht Member des Servers! ' + message.author.username + '#' + message.author.discriminator);
                    return;
                }

                if(!server.roles.exists('name', config.PLAYRADIO_MINRANK)) {
                    console.log(getDateTime() + '!pr: Rang nicht gefunden! ' + config.PLAYRADIO_MINRANK);
                    return;
                }

                if (server.members.find('id', message.author.id).highestRole.comparePositionTo(server.roles.find('name', config.PLAYRADIO_MINRANK)) < 0) {
                    return respond(message, 'Nicht genügend Rechte!', true, false);
                }

                if(server.roles.exists('name', config.PLAYRADIO_MINRANK_FORCE)) {
                    if (server.members.find('id', message.author.id).highestRole.comparePositionTo(server.roles.find('name', config.PLAYRADIO_MINRANK_FORCE )) >= 0) {
                        playRadio();
                        console.log(getDateTime() + '!pr: Stream restarted Mod by ' + message.author.username + '#' + message.author.discriminator);
                        return respond(message, 'Radio Stream wird neugestartet.', true, false);
                    }
                }

                if(prTimeout) {
                    return respond(message, 'Radio Stream wurde bereits vor kurzem neugestartet, versuche es bitte später erneut.', true, false);
                }

                console.log(prTimeout);

                prTimeout = true;
                setTimeout(() => {
                    prTimeout = false;
                }, 60000 * 5);

                playRadio();
                console.log(getDateTime() + '!pr: Stream restarted by ' + message.author.username + '#' + message.author.discriminator);
                return respond(message, 'Radio Stream wird neugestartet.', true, false);
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

function getDateTime() {
    return "[" + new Date().toLocaleString() + "] ";
}

function idle() {
    bot.user.setStatus('idle');
}

function online() {
    bot.user.setStatus('online');
}

/* LOGIN */
bot.login(token);

