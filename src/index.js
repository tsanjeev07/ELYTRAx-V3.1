require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');
const {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} = require('@discordjs/voice');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.');
  process.exit(1);
}

const audioDirectory = path.join(__dirname, '..', 'audio');
const supportedAudioExtensions = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']);
const welcomeMessage = (userId) => `Welcome <@${userId}> to **ELYTRAx — Team Elytra**! 🚀 We're under development. Follow **@tsanjeev_07** for updates.`;
const activityCycle = [
  { type: ActivityType.Listening, name: 'the ELYTRAx radio 🎧' },
  { type: ActivityType.Playing, name: 'the never-ending loop 🔁' },
  { type: ActivityType.Watching, name: 'the next track load ✨' },
  { type: ActivityType.Competing, name: 'for best VC vibes 🏆' },
];
const activityIntervalMs = 30_000;

if (ffmpegPath) process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH ?? ''}`;
fs.mkdirSync(audioDirectory, { recursive: true });

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const sessions = new Map();
let activityIndex = 0;

const commands = [
  new SlashCommandBuilder().setName('play').setDescription('Join your voice channel and loop all songs in the audio folder.'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop the music and leave the voice channel.'),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('Registered /play and /stop.');
}

function getAudioFiles() {
  return fs.readdirSync(audioDirectory)
    .filter((file) => supportedAudioExtensions.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(audioDirectory, file));
}

function endSession(guildId, session) {
  if (sessions.get(guildId) !== session) return;
  sessions.delete(guildId);
  session.isPlaying = false;
  session.player.stop(true);
  session.connection.destroy();
}

function playNextTrack(guildId, session) {
  if (sessions.get(guildId) !== session) return;
  const files = getAudioFiles();
  if (files.length === 0) {
    console.log(`No supported audio files remain for guild ${guildId}; leaving voice channel.`);
    endSession(guildId, session);
    return;
  }

  const previousIndex = session.currentTrack ? files.indexOf(session.currentTrack) : -1;
  const nextIndex = (previousIndex + 1) % files.length;
  const nextTrack = files[nextIndex];
  session.currentTrack = nextTrack;
  session.trackNumber = nextIndex + 1;
  session.player.play(createAudioResource(nextTrack));
  session.isPlaying = true;
  console.log(`Playing ${path.basename(nextTrack)} in guild ${guildId}.`);
  updateNowPlayingMessage(session, nextTrack, files.length);
}

function updateNowPlayingMessage(session, trackPath, playlistLength) {
  const trackName = path.basename(trackPath, path.extname(trackPath)).replace(/[_-]+/g, ' ');
  const content = `🎶 **ELYTRAx VC Radio**\nNow playing: **${trackName}**\nTrack ${session.trackNumber} of ${playlistLength} · looping the playlist 🔁`;
  session.messageQueue = session.messageQueue.catch(() => {}).then(async () => {
    if (session.nowPlayingMessage) {
      await session.nowPlayingMessage.edit(content);
      return;
    }
    session.nowPlayingMessage = await session.channel.send(content);
  }).catch((error) => console.error('Could not update the now-playing message:', error));
}

function cycleActivity(readyClient) {
  const activity = activityCycle[activityIndex % activityCycle.length];
  activityIndex += 1;
  readyClient.user.setActivity(activity.name, { type: activity.type });
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready as ${readyClient.user.tag}`);
  cycleActivity(readyClient);
  setInterval(() => cycleActivity(readyClient), activityIntervalMs);
  try {
    await registerCommands();
  } catch (error) {
    console.error('Could not register slash commands:', error);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!newState.channelId || oldState.channelId === newState.channelId || newState.member?.user.bot) return;
  try {
    const session = sessions.get(newState.guild.id);
    if (!session || !session.isPlaying || session.channelId !== newState.channelId) return;
    await session.channel.send(welcomeMessage(newState.id));
  } catch (error) {
    console.error(`Could not post the voice-channel welcome in guild ${newState.guild.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'play') {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: 'Join a voice channel first, then run `/play`.', ephemeral: true });
      return;
    }

    if (sessions.has(interaction.guildId)) {
      await interaction.reply({ content: 'The playlist is already looping in this server.', ephemeral: true });
      return;
    }

    if (getAudioFiles().length === 0) {
      await interaction.reply({ content: 'I could not find any supported songs in the `audio` folder.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    let session;
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
      connection.subscribe(player);
      session = {
        connection,
        player,
        channel,
        channelId: channel.id,
        currentTrack: null,
        trackNumber: 0,
        isPlaying: false,
        nowPlayingMessage: null,
        messageQueue: Promise.resolve(),
      };

      player.on(AudioPlayerStatus.Idle, () => playNextTrack(interaction.guildId, session));
      player.on('error', (error) => console.error('Audio player error:', error));
      connection.on('error', (error) => console.error('Voice connection error:', error));

      sessions.set(interaction.guildId, session);
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      playNextTrack(interaction.guildId, session);
      await interaction.editReply(`Joined **${channel.name}** and started the playlist. Songs in \`audio\` play in alphabetical order and loop.`);
    } catch (error) {
      if (session) endSession(interaction.guildId, session);
      console.error('Could not start playback:', error);
      await interaction.editReply('I could not join or start audio. Check my Connect and Speak permissions, then try again.');
    }
    return;
  }

  if (interaction.commandName === 'stop') {
    const session = sessions.get(interaction.guildId);
    if (!session) {
      await interaction.reply({ content: 'There is no music session running in this server.', ephemeral: true });
      return;
    }
    endSession(interaction.guildId, session);
    await interaction.reply('Stopped playback and left the voice channel.');
  }
});

client.login(token);
