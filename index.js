require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const chrono = require('chrono-node');
const { DateTime, FixedOffsetZone } = require('luxon');

const TZ_ALIASES = {
  KST: 'Asia/Seoul',
  JST: 'Asia/Tokyo',
  NZT: 'Pacific/Auckland',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  UTC: 'UTC',
  GMT: 'UTC'
};

function parseOffsetZone(input) {
  const match = input.match(/^(?:UTC|GMT)?([+-])(\\d{1,2})(?::?(\\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return FixedOffsetZone.instance(sign * (hours * 60 + minutes));
}

function extractTimezone(str) {
  const iana = str.match(/[A-Za-z_]+\/[A-Za-z_]+/);
  if (iana) return { zone: iana[0], text: str.replace(iana[0], '').trim() };

  const offset = str.match(/(?:UTC|GMT)?[+-]\\d{1,2}(?::?\\d{2})?/i);
  if (offset) return { zone: offset[0], text: str.replace(offset[0], '').trim() };

  const abbrev = str.match(/\\b[A-Z]{2,5}\\b/);
  if (abbrev && TZ_ALIASES[abbrev[0]]) {
    return { zone: TZ_ALIASES[abbrev[0]], text: str.replace(abbrev[0], '').trim() };
  }

  return { zone: null, text: str };
}

function toUnixSeconds(input) {
  const { zone, text } = extractTimezone(input);
  if (!zone) throw new Error('Timezone missing (example: KST, UTC+9, Asia/Seoul)');

  const parsed = chrono.parse(text, new Date());
  if (!parsed.length) throw new Error('Could not parse date/time');

  const start = parsed[0].start;
  const base = DateTime.now();

  const parts = {
    year: start.get('year') ?? base.year,
    month: start.get('month') ?? base.month,
    day: start.get('day') ?? base.day,
    hour: start.get('hour') ?? 0,
    minute: start.get('minute') ?? 0,
    second: 0
  };

  const offsetZone = typeof zone === 'string' ? parseOffsetZone(zone) : null;
  const dt = DateTime.fromObject(parts, { zone: offsetZone ?? zone });

  if (!dt.isValid) throw new Error('Invalid date or timezone');
  return Math.floor(dt.toSeconds());
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'time') return;

  const input = interaction.options.getString('input', true);
  try {
    const unix = toUnixSeconds(input);
    await interaction.reply({
      content: `🕒 <t:${unix}:F>  •  <t:${unix}:R>`,
      ephemeral: true
    });
  } catch (err) {
    await interaction.reply({
      content: `❌ ${err.message}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
