const nsq = require('nsqjs')
const {endsWith, isNil} = require('ramda')
const {blue, green, yellow} = require('@buzuli/color')

const log = require('../lib/log')

function builder (yargs) {
  return yargs
    .option('ack', {
      type: 'boolean',
      default: true,
      desc: 'acknowledge received messages'
    })
    .option('allow-non-ephemeral', {
      type: 'boolean',
      default: false,
      desc: 'prevents coercion to ephemeral channels'
    })
    .option('auth-secret', {
      type: 'string',
      desc: 'cluster access secret'
    })
    .option('channel', {
      aliases: ['c'],
      type: 'string',
      default: 'buzuli#ephemeral',
      desc: 'the channel from which to "peak"'
    })
    .option('client-id', {
      type: 'string',
      default: 'buzuli'
    })
    .option('limit', {
      type: 'number',
      default: 10
    })
    .option('lookupd-host', {
      type: 'array'
    })
    .option('nsqd-host', {
      type: 'array'
    })
    .option('requeue-delay', {
      type: 'number',
      default: 100
    })
    .option('tls', {
      type: 'boolean',
      default: false
    })
    .option('tls-verify', {
      type: 'boolean',
      default: false
    })
    .option('unlimited', {
      type: 'boolean',
      default: false
    })
}

function handler (argv) {
  const {
    ack,
    allowNonEphemeral,
    authSecret,
    clientId,
    limit,
    lookupdHost,
    nsqdHost,
    requeueDelay,
    tls,
    tlsVerify,
    topic,
    unlimited
  } = argv

  let channel = argv.channel

  if (!allowNonEphemeral) {
    channel = endsWith('#ephemeral')(channel) ? channel : `${channel}#ephemeral`
  }

  const options = {clientId}

  if (tls === true) {
    log.info(`   tls-verify: ${tlsVerify}`)
    options.tls = tls
    options.tlsVerification = tlsVerify !== false
  }

  if (!isNil(requeueDelay)) {
    log.info(`requeue-delay: ${requeueDelay}`)
    options.requeueDelay = requeueDelay
  }

  if (!isNil(authSecret)) {
    log.info(`  auth-secret: ***`)
    options.authSecret = authSecret
  }

  if (!isNil(nsqdHost)) {
    log.info(`   nsqd-hosts: ${nsqdHost}`)
    options.nsqdTCPAddresses = nsqdHost
  } else if (!isNil(lookupdHost)) {
    log.info(`lookupd-hosts: ${lookupdHost}`)
    options.lookupdHTTPAddresses = lookupdHost
  } else {
    log.error(`You must specify at least one host (--nsqdHost > --lookupdHost).`)
    process.exit(1)
  }

  const limitStr = unlimited ? '∞' : `${limit}`
  const progress = () => `${count}/${limitStr}`

  log.info(`        topic: ${topic}`)
  log.info(`      channel: ${channel}`)
  log.info(`        limit: ${limitStr}`)
  log.info(`    client-id: ${clientId}`)
  log.info(`          tls: ${tls}`)

  let count = 0
  let halting = false
  const reader = new nsq.Reader(topic, channel, options)

  // Schedule halt
  function shutdown () {
    if (!halting) {
      const delay = 1000
      const termTime = new Date(new Date().getTime() + delay).toISOString()
      log.info(yellow(`scheduling connection to terminate at`), termTime)
      halting = true
      setTimeout(closer, 1000)
    }
  }

  function closer () {
    log.info(yellow(`closing connection now`))
    reader.close()
  }

  function messageHandler (msg) {
    count++
    log.info(msg.json())

    if (ack) {
      log.info(blue(`acknowledging message ${progress()}`))
      msg.finish()
    } else {
      log.info(yellow(`re-queueing message ${progress()}`))
      msg.requeue(requeueDelay)
    }

    if (!unlimited && count >= limit) {
      log.info(yellow(`${progress()} messages received; halting`))
      reader.removeListener('message', messageHandler)
      setTimeout(shutdown)
    }
  }

  reader.on('nsqd_connected', () => log.info(green('connected')))
  reader.on('nsqd_closed', () => log.info(yellow('disconnected')))
  reader.on('error', error => log.error('error', ':', error))
  reader.on('message', messageHandler)

  reader.connect()
}

module.exports = {
  command: 'nsq-peek <topic>',
  desc: 'peek at messages in the named topic',
  builder,
  handler
}
