var Discord = require('discord.js'),
    config = require('./config'),
    token = config.TOKEN,
    bot = new Discord.Client(),
    server,
    version,
    exec,
    stream = null;

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

    if (!bot.guilds.exists('id', config.SERVER_ID)) {
        console.log('Bot is not connected to the selected server!');
        process.exit();
    }

    server = bot.guilds.find('id', config.SERVER_ID);

    stream = playRadio();
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
                    var parsed = icy.parse(metadata);
                    bot.user.setGame(parsed.StreamTitle);
                });

                return connection.playStream(res, streamOptions);
            });
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

/* PERMISSIONS */
function Permission(checker) {
    return {
        check: function (user) {
            if (!server.members.exists('id', user.id)) {
                return false;
            }

            var member = server.members.find('id', user.id);

            return checker(member);
        }
    };
}

function respond(message, response, pm) {
    if (typeof pm === 'undefined') {
        pm = false;
    }

    if (pm) {
        message.author.sendMessage(response);
    } else {
        message.reply(response);
    }
}

/* COMMAND PROCESSING */
function processCommand(message, command, args) {
    switch (command) {
        case 'radio':
        case 'rv':
            (function () {
                respond(message, "Running DiscordRadio.de by @DerAtrox#1257, Version: `" + version + "`.\nAktuellster Commit: https://github.com/DerAtrox/DiscordRadio/commit/" + version);
            })();
            break;
        case 'nowplaying':
        case 'np':
            (function () {
                respond(message, "Running DiscordRadio.de by @DerAtrox#1257, Version: `" + version + "`.\nAktuellster Commit: https://github.com/DerAtrox/DiscordRadio/commit/" + version);
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

