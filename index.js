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

/* ------------------------------
   ENV checks
--------------------------------*/
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN missing');
  process.exit(1);
}
if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('❌ CLIENT_ID or GUILD_ID missing (needed to register /time)');
  process.exit(1);
}

/* ------------------------------
   Timezone helpers
--------------------------------*/
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
  GMT: 'UTC',
  UTC: 'UTC',
};

function parseOffsetZone(tzRaw) {
  // UTC+9, UTC+09:00, GMT-5, +0900 etc
  const m = tzRaw.match(/^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const hh = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return FixedOffsetZone.instance(sign * (hh * 60 + mm));
}

function extractTimezone(input) {
  // IANA tz: Asia/Seoul
  const iana = input.match(/\b[A-Za-z_]+\/[A-Za-z_]+\b/);
  if (iana) return { zone: iana[0], cleaned: input.replace(iana[0], '').trim() };

  // UTC offsets: UTC+9, GMT+09:00
  const offset = input.match(/\b(?:UTC|GMT)?\s*[+-]\s*\d{1,2}(?::?\d{2})?\b/i);
  if (offset) return { zone: offset[0].replace(/\s+/g, ''), cleaned: input.replace(offset[0], '').trim() };

  // Abbrev: KST, NZST, PST...
  const abbr = input.match(/\b[A-Za-z]{2,5}\b/);
  if (abbr) {
    const key = abbr[0].toUpperCase();
    if (TZ_ALIASES[key]) return { zone: TZ_ALIASES[key], cleaned: input.replace(abbr[0], '').trim() };
  }

  return { zone: null, cleaned: input.trim() };
}

function normalizeQuotedInput(s) {
  let x = s.trim();

  // Normalize curly quotes artifacts if they leak into text
  x = x.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Insert a space between time and timezone when glued (4pmKST, 16:00KST, 4:00pmkst)
  // Examples:
  // 4pmKST -> 4pm KST
  // 16:00KST -> 16:00 KST
  x = x.replace(
    /(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(\s*)([A-Za-z]{2,5}\b)/gi,
    (m, t, _sp, tz) => `${t.trim()} ${tz.toUpperCase()}`
  );

  // Clean weird spacing
  x = x.replace(/\s+/g, ' ').trim();

  return x;
}

function toUnixSecondsFromText(raw) {
  const normalized = normalizeQuotedInput(raw);
  const { zone, cleaned } = extractTimezone(normalized);

  if (!zone) {
    throw new Error(`Timezone missing in "${raw}" (add e.g. KST, UTC+9, Asia/Seoul)`);
  }

  // Parse the date/time portion
  const results = chrono.parse(cleaned, new Date());
  if (!results.length) throw new Error(`Could not parse time in "${raw}"`);

  const start = results[0].start;
  const now = DateTime.now();

  const parts = {
    year: start.get('year') ?? now.year,
    month: start.get('month') ?? now.month,
    day: start.get('day') ?? now.day,
    hour: start.get('hour') ?? 0,
    minute: start.get('minute') ?? 0,
    second: 0,
  };

  const offsetZone = typeof zone === 'string' ? parseOffsetZone(zone) : null;
  const dt = DateTime.fromObject(parts, { zone: offsetZone ?? zone });
  if (!dt.isValid) throw new Error(`Invalid timezone/date in "${raw}"`);

  return Math.floor(dt.toSeconds());
}

/* ------------------------------
   Client (NOTE: added intents!)
--------------------------------*/
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,     // needed for messageCreate [3](https://discordjs.guide/popular-topics/intents)
    GatewayIntentBits.MessageContent,    // privileged; must be enabled in portal [2](https://support-dev.discord.com/hc/en-us/articles/4404772028055-Message-Content-Privileged-Intent-FAQ)
  ],
});

/* ------------------------------
   Register /time on startup (guild)
--------------------------------*/
const commands = [
  new SlashCommandBuilder()
    .setName('time')
    .setDescription('Convert a time + timezone into a Discord timestamp')
    .addStringOption(opt =>
      opt.setName('input')
        .setDescription('Example: "4pm KST", "tomorrow 16:00 Asia/Seoul"')
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
  console.log('✅ Slash commands registered');
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try { await registerCommands(); } catch (e) { console.error('Command register failed:', e); }
});

/* ------------------------------
   Slash command handler
--------------------------------*/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'time') return;

  const input = interaction.options.getString('input', true);
  try {
    const unix = toUnixSecondsFromText(input);
    await interaction.reply({ content: `🕒 <t:${unix}:F>\n⏳ <t:${unix}:R>`, ephemeral: false });
  } catch (e) {
    await interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
  }
});

/* ------------------------------
   Message listener: ONLY quoted text triggers
--------------------------------*/
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Match "..." and “...”
  const matches = [];
  const reStraight = /"([^"]+)"/g;
  const reSmart = /“([^”]+)”/g;

  for (const m of message.content.matchAll(reStraight)) matches.push(m[1]);
  for (const m of message.content.matchAll(reSmart)) matches.push(m[1]);

  if (matches.length === 0) return;

  // Convert only those that look like they contain a time (reduces false triggers)
  const candidates = matches.filter(s => /\d{1,2}/.test(s));
  if (candidates.length === 0) return;

  const lines = [];
  for (const raw of candidates) {
    try {
      const unix = toUnixSecondsFromText(raw);
      lines.push(`“${raw}” → <t:${unix}:F>  •  <t:${unix}:R>`);
    } catch (e) {
      lines.push(`“${raw}” → ❌ ${e.message}`);
    }
  }

  // Reply once with results
  await message.reply({
    content: lines.join('\n'),
    allowedMentions: { repliedUser: false },
  });
});

client.login(process.env.DISCORD_TOKEN);
``
