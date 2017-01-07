let Discord = require('discord.js'),
    config = require('./config'),
    moment = require('moment'),
    token = config.TOKEN,
    bot = new Discord.Client(),
    server,
    version,
    exec = require('child_process').exec,
    vconnection = null,
    stream = null,
    meta = null,
    endManual = false,
    prTimeout = false;

/* VERSION */
function getVersion(callback) {
    let info = {};

    exec('git rev-parse --short=4 HEAD', function (error, version) {
        if (error) {
            bot.log('Error getting version', error);
            info.version = 'unknown';
        } else {
            info.version = version.trim();
        }

        exec('git log -1 --pretty=%B', function (error, message) {
            if (error) {
                bot.log('Error getting commit message', error);
            } else {
                info.message = message.trim();
            }

            exec('git log -1 --date=short --pretty=format:%ci', function (error, timestamp) {
                if (error) {
                    console.log('Error getting creation time', error);
                } else {
                    info.timestamp = timestamp;
                }

                callback(info);
            });
        });
    });
}

/* BOT EVENTS */
bot.on('ready', function () {
    online();
    console.log(getDateTime() + 'I am ready!');
    getVersion(info => {
        bot.versionInfo = info;
        bot.user.setGame('version ' + bot.versionInfo.version);

        if (config.DEBUG) bot.channels.get(config.TEXT_CH).sendMessage('I am ready, running version `' + bot.versionInfo.version + '`!');
    });

    if (!bot.guilds.has(config.SERVER_ID)) {
        console.log('Bot is not connected to the selected server!');
        process.exit();
    }

    server = bot.guilds.get(config.SERVER_ID);

    playRadio();
});

function playRadio() {
    endManual = true;
    bot.voiceConnections.filter((connection) => {
        return connection.channel.guild.id == config.SERVER_ID;
    }).forEach((connection) => {
        connection.disconnect();
    });
    endManual = false;

    const streamOptions = {volume: 0.1};

    const channel = server.channels.get(config.VOICE_CH);

    channel.join().then(function (connection) {
        let disconnectTriggerd = false;

        console.log(getDateTime() + 'Voice connect');

        connection.on('disconnect', function () {
            console.log(getDateTime() + 'Voice disconnect');

            if (disconnectTriggerd || endManual) return;

            disconnectTriggerd = true;

            setTimeout(function () {
                playRadio();
            }, 2000);
        });

        connection.on('error', function (err) {
            console.log(getDateTime() + 'Voice error ' + err);
        });

        const icy = require('icy');
        const url = require('url');

        const opts = url.parse(config.STREAM);
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
            });

            stream.on('end', function () {
                connection.disconnect();
                console.log(getDateTime() + 'Stream ended');
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

function onMessage(message) {
    if (message.author.id == bot.user.id) {
        return;
    }

    if (message.channel.type == 'group') {
        return;
    }

    function handleCommand() {
        let match = /^[\/!]([a-zA-Z]+).*$/.exec(message.content);

        if (message.channel.type == 'dm') {
            match = /^[\/!]?([a-zA-Z]+).*$/.exec(message.content);
        }

        if (match) {
            const args = message.content.split(' ').splice(1);

            processCommand(message, match[1].toLowerCase(), args);
        }
    }

    if (server.channels.has(message.channel.id)) {
        handleCommand();
    } else {
        if (server.members.has(message.author.id)) {
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
                let embed = new Discord.RichEmbed({
                    author: {
                        name: server.name,
                        icon_url: server.iconURL,
                        url: 'http://bronies.de/'
                    },
                    thumbnail: {
                        url: bot.user.avatarURL
                    },
                    title: `DerAtrox/DiscordRadio@` + bot.versionInfo.version,
                    description: 'Umgesetzt mit Hilfe von [Node.js](https://nodejs.org/), [discord.js](https://discord.js.org/) und [node-icy](https://github.com/TooTallNate/node-icy).',
                    fields: [
                        {
                            name: 'Version',
                            value: bot.versionInfo.version,
                            inline: true
                        },
                        {
                            name: 'Letzter Commit',
                            value: 'https://github.com/DerAtrox/DiscordRadio/commit/' + bot.versionInfo.version,
                            inline: true
                        }
                    ],
                    color: 0x610C12
                });

                if('message' in bot.versionInfo) {
                    embed.addField('Letzte Commitnachricht', bot.versionInfo.message, true);
                }

                if('timestamp' in bot.versionInfo) {
                    embed.addField('Erstellt', (moment(bot.versionInfo.timestamp, 'YYYY-MM-DD HH:mm:ss Z').locale('de').fromNow()), true);
                }

                message.channel.sendEmbed(embed);



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

                let text;

                let metaS = meta.StreamTitle.split(' - ');
                if (metaS.length == 2) {
                    text = '🎶 Derzeit läuft **' + metaS[1] + '** von **' + metaS[0] + '**.';
                } else {
                    text = '🎶 Derzeit läuft **' + meta + '**.';
                }

                const YouTube = require('youtube-node');

                const youTube = new YouTube();

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
                if (!server.members.has(message.author.id)) {
                    console.log(getDateTime() + '!pr: Nutzer nicht Member des Servers! ' + message.author.username + '#' + message.author.discriminator);
                    return;
                }

                if (!server.roles.exists('name', config.PLAYRADIO_MINRANK)) {
                    console.log(getDateTime() + '!pr: Rang nicht gefunden! ' + config.PLAYRADIO_MINRANK);
                    return;
                }

                if (server.members.get(message.author.id).highestRole.comparePositionTo(server.roles.find('name', config.PLAYRADIO_MINRANK)) < 0) {
                    return respond(message, 'Nicht genügend Rechte!', true, false);
                }

                if (server.roles.exists('name', config.PLAYRADIO_MINRANK_FORCE)) {
                    if (server.members.get(message.author.id).highestRole.comparePositionTo(server.roles.find('name', config.PLAYRADIO_MINRANK_FORCE)) >= 0) {
                        try {
                            vconnection.disconnect();
                        } catch (e) {
                            console.log(getDateTime() + 'Could not disconnect voice. Trying playRadio');
                            playRadio();
                        }
                        console.log(getDateTime() + '!pr: Stream restarted Mod by ' + message.author.username + '#' + message.author.discriminator);
                        return respond(message, 'Radio Stream wird neugestartet.', true, false);
                    }
                }

                if (prTimeout) {
                    return respond(message, 'Radio Stream wurde bereits vor kurzem neugestartet, versuche es bitte später erneut.', true, false);
                }

                prTimeout = true;
                setTimeout(() => {
                    prTimeout = false;
                }, 60000 * 5);

                try {
                    vconnection.disconnect();
                } catch (e) {
                    console.log(getDateTime() + 'Could not disconnect voice. Trying playRadio');
                    playRadio();
                }

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

