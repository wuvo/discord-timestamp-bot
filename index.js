require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is not set');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'time') return;

  const input = interaction.options.getString('input', true);

  try {
    const parsed = chrono.parseDate(input, new Date());
    if (!parsed) {
      throw new Error('Could not parse date/time');
    }

    const dt = DateTime.fromJSDate(parsed);
    const unix = Math.floor(dt.toSeconds());

    await interaction.reply({
      content: `<t:${unix}:F>  •  <t:${unix}:R>`,
      ephemeral: true,
    });
  } catch (err) {
    await interaction.reply({
      content: `❌ ${err.message}`,
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
``
