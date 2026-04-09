require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('time')
    .setDescription('Convert a time + timezone into a Discord timestamp')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Example: 4pm KST, tomorrow 6pm NZST')
        .setRequired(true)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash command...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log('✅ Slash command registered');
  } catch (error) {
    console.error(error);
  }
})();
