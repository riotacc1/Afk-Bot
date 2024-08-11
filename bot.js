// bot.js

const express = require('express');
const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock, GoalXZ } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const loggers = require('./logging.js');
const logger = loggers.logger;

const app = express();
const PORT = process.env.PORT || 3000;

// Accounts to cycle through
const accounts = [
    { username: 'WatchDog1', password: config['bot-account']['password'], auth: config['bot-account']['type'] },
    { username: 'WatchDog2', password: config['bot-account']['password'], auth: config['bot-account']['type'] },
    { username: 'WatchDog3', password: config['bot-account']['password'], auth: config['bot-account']['type'] },
    { username: 'WatchDog4', password: config['bot-account']['password'], auth: config['bot-account']['type'] }
];

let accountIndex = 0;

function createBot() {
    const account = accounts[accountIndex];
    const bot = mineflayer.createBot({
        username: account.username,
        password: account.password,
        auth: account.auth,
        host: config.server.ip,
        port: config.server.port,
        version: config.server.version,
    });

    bot.loadPlugin(pathfinder);
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.settings.colorsEnabled = false;
    bot.pathfinder.setMovements(defaultMove);

    bot.once('spawn', () => {
        logger.info(`${account.username} joined the server`);

        // Auto-authentication
        if (config.utils['auto-auth'].enabled) {
            logger.info('Started auto-auth module');
            const password = config.utils['auto-auth'].password;
            setTimeout(() => {
                bot.chat(`/register ${password} ${password}`);
                bot.chat(`/login ${password}`);
            }, 500);
            logger.info(`Authentication commands executed`);
        }

        // Chat messages
        if (config.utils['chat-messages'].enabled) {
            logger.info('Started chat-messages module');
            const messages = config.utils['chat-messages']['messages'];
            if (config.utils['chat-messages'].repeat) {
                const delay = config.utils['chat-messages']['repeat-delay'];
                let i = 0;
                setInterval(() => {
                    bot.chat(`${messages[i]}`);
                    i = (i + 1) % messages.length;
                }, delay * 1000);
            } else {
                messages.forEach((msg) => {
                    bot.chat(msg);
                });
            }
        }

        // Move to a specific location
        const pos = config.position;
        if (config.position.enabled) {
            logger.info(
                `Starting moving to target location (${pos.x}, ${pos.y}, ${pos.z})`
            );
            bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
        }

        // Anti-AFK measures
        if (config.utils['anti-afk'].enabled) {
            if (config.utils['anti-afk'].sneak) {
                bot.setControlState('sneak', true);
            }
            if (config.utils['anti-afk'].jump) {
                bot.setControlState('jump', true);
            }
            if (config.utils['anti-afk']['hit'].enabled) {
                const delay = config.utils['anti-afk']['hit']['delay'];
                const attackMobs = config.utils['anti-afk']['hit']['attack-mobs'];
                setInterval(() => {
                    if (attackMobs) {
                        const entity = bot.nearestEntity(e => e.type !== 'object' && e.type !== 'player'
                            && e.type !== 'global' && e.type !== 'orb' && e.type !== 'other');
                        if (entity) {
                            bot.attack(entity);
                            return;
                        }
                    }
                    bot.swingArm("right", true);
                }, delay);
            }
            if (config.utils['anti-afk'].rotate) {
                setInterval(() => {
                    bot.look(bot.entity.yaw + 1, bot.entity.pitch, true);
                }, 100);
            }
            if (config.utils['anti-afk']['circle-walk'].enabled) {
                const radius = config.utils['anti-afk']['circle-walk']['radius'];
                circleWalk(bot, radius);
            }
        }

        // Disconnect and reconnect with next account after 6 hours
        setTimeout(() => {
            logger.info(`${account.username} disconnecting for auto-reconnect cycle.`);
            bot.end(); // This will trigger the 'end' event and start the next bot
        }, 21600000); // 6 hours in milliseconds

    });

    bot.on('chat', (username, message) => {
        if (config.utils['chat-log']) {
            logger.info(`<${username}> ${message}`);
        }
    });

    bot.on('goal_reached', () => {
        if (config.position.enabled) {
            logger.info(
                `Bot arrived at target location. ${bot.entity.position}`
            );
        }
    });

    bot.on('death', () => {
        logger.warn(
            `Bot has died and was respawned at ${bot.entity.position}`
        );
    });

    bot.on('end', () => {
        // Move to the next account
        accountIndex = (accountIndex + 1) % accounts.length;
        setTimeout(() => {
            createBot();
        }, config.utils['auto-reconnect-delay']);
    });

    bot.on('kicked', (reason) => {
        let reasonText = '';

        try {
            const parsedReason = JSON.parse(reason);
            if (parsedReason.text) {
                reasonText = parsedReason.text;
            } else if (parsedReason.extra && parsedReason.extra[0] && parsedReason.extra[0].text) {
                reasonText = parsedReason.extra[0].text;
            }
        } catch (e) {
            logger.error(`Failed to parse kick reason: ${e.message}`);
        }

        reasonText = reasonText.replace(/§./g, '') || 'Unknown reason';
        logger.warn(`Bot was kicked from the server. Reason: ${reasonText}`);
    });

    bot.on('error', (err) => {
        logger.error(`An error occurred: ${err.message}`);
    });
}

function circleWalk(bot, radius) {
    return new Promise(() => {
        const pos = bot.entity.position;
        const x = pos.x;
        const y = pos.y;
        const z = pos.z;
        const points = [
            [x + radius, y, z],
            [x, y, z + radius],
            [x - radius, y, z],
            [x, y, z - radius],
        ];
        let i = 0;
        setInterval(() => {
            if (i === points.length) i = 0;
            bot.pathfinder.setGoal(new GoalXZ(points[i][0], points[i][2]));
            i++;
        }, 1000);
    });
}

createBot();

// Set up a simple Express server
app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});
