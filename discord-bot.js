let Discord = require('discord.js'),
    config = require('./config'),
    moment = require('moment'),
    axios = require('axios'),
    YouTube = require('youtube-node'),
    youTube = new YouTube(),
    token = config.TOKEN,
    bot = new Discord.Client(),
    server,
    version,
    exec = require('child_process').exec,
    vconnection = null,
    stream = null,
    meta = null;

youTube.setKey(config.YOUTUBE_KEY);
youTube.addParam('type', 'video');

bot.log = (msg) => {
    console.log(`[${moment().format("YYYY-MM-DD HH:mm:ss")}] ${msg}`);
};

/* VERSION */
function getVersion(callback) {
    let info = {};

    exec('git rev-parse --short=4 HEAD', function (error, version) {
        if (error) {
            bot.log('Error getting version: ' + error);
            info.version = 'unknown';
        } else {
            info.version = version.trim();
        }

        exec('git log -1 --pretty=%B', function (error, message) {
            if (error) {
                bot.log('Error getting commit message: ' + error);
            } else {
                info.message = message.trim();
            }

            exec('git log -1 --date=short --pretty=format:%ci', function (error, timestamp) {
                if (error) {
                    bot.log('Error getting creation time: ' + error);
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
    bot.log('I am ready!');
    getVersion(info => {
        bot.versionInfo = info;
        bot.user.setGame('version ' + bot.versionInfo.version);

        if (config.DEBUG) bot.channels.get(config.TEXT_CH).sendMessage('I am ready, running version `' + bot.versionInfo.version + '`!');
    });

    if (!bot.guilds.has(config.SERVER_ID)) {
        bot.log('Bot is not connected to the selected server!');
        process.exit();
    }

    server = bot.guilds.get(config.SERVER_ID);

    playRadio();
});

function playRadio() {
    const streamOptions = {volume: 0.1};

    const channel = server.channels.get(config.VOICE_CH);

    channel.join().then(function (connection) {
        bot.log('Voice connect');

        connection.on('disconnect', function () {
            process.exit();
        });

        connection.on('error', function (err) {
            bot.log('Voice error ' + err);
        });

        const icy = require('icy');
        const url = require('url');

        const opts = url.parse(config.STREAM);
        opts.headers = {'User-Agent': config.USER_AGENT};

        icy.get(opts, function (res) {

            if (config.DEBUG) bot.log(JSON.stringify(res.headers));

            res.on('metadata', function (metadata) {
                meta = icy.parse(metadata);
                bot.user.setGame(meta.StreamTitle);
            });

            stream = connection.playStream(res, streamOptions);

            stream.on('start', function () {
                bot.log('Stream started');
            });

            stream.on('end', function () {
                connection.disconnect();
                bot.log('Stream ended');
            });

            stream.on('error', function (error) {
                bot.log('Stream error ');
                bot.log(error);
            });
        });

        vconnection = connection;
    })
        .catch(bot.log);
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
                const linkLastCommit = 'https://github.com/DerAtrox/DiscordRadio/commit/' + bot.versionInfo.version;

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
                            value: `[${linkLastCommit}](${linkLastCommit})`,
                            inline: true
                        }
                    ],
                    color: 0x610C12
                });

                if ('message' in bot.versionInfo) {
                    embed.addField('Letzte Commitnachricht', bot.versionInfo.message, true);
                }

                if ('timestamp' in bot.versionInfo) {
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

                function getMetaData(callback) {
                    if (config.DATA != '') {
                        axios.get(config.DATA)
                            .then((res) => {
                                return callback(res.data.result);
                            })
                            .catch((err) => {
                                bot.log(err);
                                return callback('');
                            })
                    } else {
                        callback('');
                    }
                }

                getMetaData(data => {
                    if (data != '') {
                        text += `\n\n ${(data.upvotes - data.downvotes)} ♥ | ${data.listener} 👥`;
                    }

                    youTube.search(meta.StreamTitle.replace(' - ', ' '), 1, function (error, result) {
                        if (error) {
                            bot.log(error);
                        } else {
                            if (result.items.length == 1) {
                                if (data == '') {
                                    text += '\n\n';
                                } else {
                                    text += ' | '
                                }

                                text += "Auf YouTube anhören:  https://youtu.be/" + result.items[0].id.videoId;

                                if (config.DEBUG) bot.log(JSON.stringify(result, null, 2));
                            }
                        }

                        return respond(message, text, false);
                    });
                });


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

