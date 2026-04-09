require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const chrono = require('chrono-node');
const { DateTime, FixedOffsetZone } = require('luxon');

/* =========================================================
   ENV VALIDATION
========================================================= */
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN missing');
  process.exit(1);
}
if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('❌ CLIENT_ID or GUILD_ID missing');
  process.exit(1);
}

/* =========================================================
   TIMEZONE HELPERS
========================================================= */
const TZ_ALIASES = {
  KST: 'Asia/Seoul',
  JST: 'Asia/Tokyo',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
  NZT: 'Pacific/Auckland',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  UTC: 'UTC',
  GMT: 'UTC',
};

function parseOffsetZone(input) {
  const m = input.match(/^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const minutes = m[3] ? parseInt(m[3], 10) : 0;
  return FixedOffsetZone.instance(sign * (hours * 60 + minutes));
}

function normalizeInput(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)([A-Za-z]{2,5})/gi,
      '$1 $2'
    )
    .trim();
}

function extractTimezone(text) {
  const iana = text.match(/\b[A-Za-z_]+\/[A-Za-z_]+\b/);
  if (iana) return { zone: iana[0], body: text.replace(iana[0], '').trim() };

  const offset = text.match(/\b(?:UTC|GMT)?\s*[+-]\s*\d{1,2}(?::?\d{2})?\b/i);
  if (offset) return { zone: offset[0], body: text.replace(offset[0], '').trim() };

  const abbr = text.match(/\b[A-Za-z]{2,5}\b/);
  if (abbr && TZ_ALIASES[abbr[0].toUpperCase()])
    return {
      zone: TZ_ALIASES[abbr[0].toUpperCase()],
      body: text.replace(abbr[0], '').trim(),
    };

  return { zone: null, body: text };
}

function toUnixTimestamp(raw) {
  const cleaned = normalizeInput(raw);
  const { zone, body } = extractTimezone(cleaned);
  if (!zone) throw new Error('Missing timezone');

  const results = chrono.parse(body, new Date());
  if (!results.length) throw new Error('Invalid time');

  const start = results[0].start;
  const now = DateTime.now();

  const dt = DateTime.fromObject(
    {
      year: start.get('year') ?? now.year,
      month: start.get('month') ?? now.month,
      day: start.get('day') ?? now.day,
      hour: start.get('hour') ?? 0,
      minute: start.get('minute') ?? 0,
      second: 0,
    },
    { zone: parseOffsetZone(zone) ?? zone }
  );

  if (!dt.isValid) throw new Error('Invalid datetime');
  return Math.floor(dt.toSeconds());
}

/* =========================================================
   DISCORD CLIENT (INTENTS MATTER)
========================================================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* =========================================================
   SLASH COMMAND REGISTRATION (AUTO)
========================================================= */
const commands = [
  new SlashCommandBuilder()
    .setName('time')
    .setDescription('Convert a time + timezone into a Discord timestamp')
    .addStringOption(opt =>
      opt.setName('input')
        .setDescription('Example: 4pm KST, tomorrow 16:00 UTC')
        .setRequired(true)
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Slash command registered');
}

/* =========================================================
   READY
========================================================= */
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

/* =========================================================
   /time HANDLER
========================================================= */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'time') return;

  try {
    const unix = toUnixTimestamp(
      interaction.options.getString('input', true)
    );
    await interaction.reply({
      content: `🕒 <t:${unix}:F>\n⏳ <t:${unix}:R>`,
      ephemeral: false,
    });
  } catch (e) {
    await interaction.reply({
      content: `❌ ${e.message}`,
      ephemeral: true,
    });
  }
});

/* =========================================================
   QUOTED MESSAGE LISTENER
========================================================= */
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const matches = [...message.content.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (!matches.length) return;

  const responses = [];
  for (const raw of matches) {
    try {
      const unix = toUnixTimestamp(raw);
      responses.push(`"${raw}" → <t:${unix}:F> • <t:${unix}:R>`);
    } catch {}
  }

  if (responses.length) {
    await message.reply({
      content: responses.join('\n'),
      allowedMentions: { repliedUser: false },
    });
  }
});

/* =========================================================
   LOGIN
========================================================= */
client.login(process.env.DISCORD_TOKEN);
