const fs = require('fs');
const stream = require('stream');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const flac = require('node-flac');

const Discord = require('discord.js');
const client = new Discord.Client();

const speech = require('@google-cloud/speech');
const sclient = new speech.SpeechClient();

// make a new stream for each time someone starts to talk
function generateOutputFile(channel, member) {
  // use IDs instead of username cause some people have stupid emojis in their name
  const fileName = `./record-flac/${channel.id}-${member.id}-${Date.now()}.flac`;
  return [fileName, fs.createWriteStream(fileName)];
}

function createRequest(filename) {
  const file = fs.readFileSync(filename);
  const audioBytes = file.toString('base64');

  // The audio file's encoding, sample rate in hertz, and BCP-47 language code
  return {
    audio: {
      content: audioBytes,
    },
    config: {
      encoding: 'FLAC',
      languageCode: 'ja-JP',
    },
  };
}

class MonoStream extends stream.Transform {
  _transform(chunk, encoding, callback) {
    this.push(chunk.filter((c, i) => i % 2))
		callback()
	}
}

client.on('message', msg => {
  if (msg.content.startsWith(config.prefix+'join')) {
    let [command, ...channelName] = msg.content.split(" ");
    if (!msg.guild) {
      return msg.reply('no private service is available in your area at the moment. Please contact a service representative for more details.');
    }
    const voiceChannel = msg.guild.channels.find("name", channelName.join(" "));
    //console.log(voiceChannel.id);
    if (!voiceChannel || voiceChannel.type !== 'voice') {
      return msg.reply(`I couldn't find the channel ${channelName}. Can you spell?`);
    }
    voiceChannel.join()
      .then(conn => {
        msg.reply('ready!');
        // create our voice receiver
        const receiver = conn.createReceiver();

        conn.on('speaking', (user, speaking) => {
          if (speaking) {
            // msg.channel.send(`I'm listening to ${user}`);
            // this creates a 16-bit signed PCM, stereo 48KHz PCM stream.
            const audioStream = receiver.createPCMStream(user);
            // create an output stream so we can dump our data in a file
            const [filename, outputStream] = generateOutputFile(voiceChannel, user);

            const encoderStream = new flac.FlacEncoder({
              channels: 1,
              bitDepth: 16,
              sampleRate: 48000
            });

            const monoStream = new MonoStream()

            // pipe our audio data into the file stream
            audioStream.pipe(monoStream);
            monoStream.pipe(encoderStream);
            encoderStream.pipe(outputStream);
            // when the stream ends (the user stopped talking) tell the user
            // audioStream.on('end', () => {
            //   msg.channel.send(`I'm no longer listening to ${user}`);
            // });
            outputStream.on('close', () => {
              sclient
                .recognize(createRequest(filename))
                .then(data => {
                  const response = data[0];
                  if(response.results.length) {
                    const transcription = response.results
                      .map(result => result.alternatives[0].transcript)
                      .join('\n');
                    msg.channel.send(`${user}: ${transcription}`);
                  }
                })
                .catch(err => {
                  console.error('ERROR:', err);
                });
            });
          }
        });
      })
      .catch(console.log);
  }
  if(msg.content.startsWith(config.prefix+'leave')) {
    let [command, ...channelName] = msg.content.split(" ");
    let voiceChannel = msg.guild.channels.find("name", channelName.join(" "));
    if (!voiceChannel || voiceChannel.type !== 'voice') {
      return msg.reply(`I couldn't find the channel ${channelName}. Can you spell?`);
    }
    voiceChannel.leave();
    return msg.reply("Left. Thanks");
  }
});


client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(config.token);
