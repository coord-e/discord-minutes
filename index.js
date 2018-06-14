const fs = require('fs')
const stream = require('stream')

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))

const winston = require('winston')

const flac = require('node-flac')

const Discord = require('discord.js')
const client = new Discord.Client()

const speech = require('@google-cloud/speech')
const sclient = new speech.SpeechClient()

class MonoStream extends stream.Transform {
  _transform (chunk, encoding, callback) {
    this.push(chunk.filter((c, i) => i % 2))
    callback()
  }
}

client.on('message', msg => {
  if (msg.content.startsWith(config.prefix + 'join')) {
    let [, ...channelName] = msg.content.split(' ')
    if (!msg.guild) {
      return msg.reply('no private service is available in your area at the moment. Please contact a service representative for more details.')
    }
    const voiceChannel = msg.guild.channels.find('name', channelName.join(' '))
    // console.log(voiceChannel.id);
    if (!voiceChannel || voiceChannel.type !== 'voice') {
      return msg.reply(`I couldn't find the channel ${channelName}. Can you spell?`)
    }
    voiceChannel.join()
      .then(conn => {
        msg.reply('ready!')
        // create our voice receiver
        const receiver = conn.createReceiver()

        const filename = `${conn.channel.name}-${Date.now()}.log`
        const logger = new (winston.Logger)({
          transports: [
            new (winston.transports.Console)(),
            new (winston.transports.File)({ filename, json: false })
          ]
        })

        conn.on('speaking', (user, speaking) => {
          if (speaking) {
            // msg.channel.send(`I'm listening to ${user}`);
            // this creates a 16-bit signed PCM, stereo 48KHz PCM stream.
            const audioStream = receiver.createPCMStream(user)

            const encoderStream = new flac.FlacEncoder({
              channels: 1,
              bitDepth: 16,
              sampleRate: 48000
            })

            const monoStream = new MonoStream()

            const recognizeStream = sclient
              .streamingRecognize({config: {encoding: 'FLAC', sampleRateHertz: 48000, languageCode: config.languageCode}})
              .on('error', logger.error)
              .on('data', response => {
                if (response.results.length) {
                  const transcription = response.results
                    .map(result => result.alternatives[0].transcript)
                    .join('\n')
                  msg.channel.send(`${user.username}: ${transcription}`)
                  logger.info(`${user.username}: ${transcription}`)
                }
              })

            // pipe our audio data into the file stream
            audioStream.pipe(monoStream).pipe(encoderStream).pipe(recognizeStream)
            // when the stream ends (the user stopped talking) tell the user
            // audioStream.on('end', () => {
            //   msg.channel.send(`I'm no longer listening to ${user}`);
            // });
          }
        })
      })
      .catch(console.log)
  }
  if (msg.content.startsWith(config.prefix + 'leave')) {
    let [, ...channelName] = msg.content.split(' ')
    let voiceChannel = msg.guild.channels.find('name', channelName.join(' '))
    if (!voiceChannel || voiceChannel.type !== 'voice') {
      return msg.reply(`I couldn't find the channel ${channelName}. Can you spell?`)
    }
    voiceChannel.leave()
    return msg.reply('Left. Thanks')
  }
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

client.login(config.token)
