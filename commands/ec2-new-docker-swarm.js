module.exports = {
  command: 'ec2-new-docker-swarm',
  desc: 'create a docker swarm cluster',
  builder,
  handler
}

function builder (yargs) {
  yargs
  .options('manager-type', {
    type: 'string',
    desc: 'aws instance type for manager nodes',
    default: 'm4.large',
    alias: ['t']
  })
  .options('swarm-alias', {
    type: 'string',
    desc: 'alias to assign this cluster for easier recognition',
    alias: ['a', 'alias']
  })
  .option('worker-count', {
    type: 'number',
    desc: 'number of worker nodes',
    default: 0,
    alias: ['c']
  })
  .options('worker-type', {
    type: 'string',
    desc: 'aws instance type for worker nodes',
    default: 'm4.large',
    alias: ['T']
  })
}

function handler ({
  managerType,
  swarmAlias,
  workerCount,
  workerType
}) {
  require('log-a-log')()

  const {
    blue,
    green,
    orange,
    purple,
    red,
    yellow,
    emoji
  } = require('@buzuli/color')
  const ec2 = require('../lib/aws').ec2()
  const r = require('ramda')
  const P = require('bluebird')
  const uuid = require('uuid/v4')

  async function run () {
    try {
      const {swarmId} = spawnSwarm()
      console.log(`Successfully launched swarm ${yellow(swarmId)} `)
    } catch (error) {
      console.error(error)
      console.error(red(emoji.inject(
        'Error launching swarm. Details above :point-up:'
      )))
    }
  }

  async function spawnSwarm () {
    const zones = await ec2.listZones()
    const swarmId = uuid() 
    const {primaryInfo: {token, ip}} = await launchManagers({swarmId, zones})

    console.info(`All managers launched.`)

    if (workerCount < 1) {
      console.log(`No workers requested.`)
    } else {
      await launchWorkers({primaryIp: ip, token, zones})
      console.log(`All ${workerCount} workers attached.`)
    }

    return {
      swarmId
    }
  }

  async function launchManagers ({swarmid, zones}) {
    // Split managers evenly between zones (regions too when relevant)

    return P.reduce(
      r.take(3)(zones),
      async (primaryInfo, zone) => {
        const managerOptions = {az, primaryInfo, swarmId}
        const {id, ip, token} = await launchManager(managerOptions)
        const {
          ip: primaryIp,
          token: primaryToken,
          clusterIps
        } = primaryInfo || {}

        // use info from primary if populated; otherwise this is the primary
        return {
          ip: primaryIp || ip,
          token: primaryToken || token,
          clusterIps: clusterIps ? [ip, ...clusterIps] : [ip]
        }
      }
    )
  }

  async function launchManager ({az, primaryInfo, swarmId}) {
    console.info(`Launching${primaryInfo ? ' primary' : ''} swarm ${yellow(swarmId)} manager in zone ${yellow(az)}`)

    // Always fetch the manager's IP after launch

    if (primaryInfo) {
      // If this is not the primary, connect to the primary
      console.info(`Attaching manager to primary...`)
      const {ip, token} = primaryInfo
    } else {
      // Otherwise fetch the primary's token
      console.info(`Fetching token from primary...`)
    }

    return {
      id: '',
      ip: ''
    }
  }

  async function launchWorkers ({primaryIp, token, zones}) {
    // Split workers evenly between zones (regions too when relevant)

    P.reduce(
      zones,
      (acc, az) => launchWorker({az, primaryIp, token})
    )
  }

  async function launchWorker ({az, primaryIp, token}) {
    instanceOptions()
    console.log(`Launching worker in zone ${yellow(az)}...`)

    const id = ''

    console.log(`Launched worker ${yellow(id)}`)
  }

  function zoneImage (az) {
    return 'ami-deadbeef'
  }

  function instanceOptions ({az, type, sshKey, launchScript = ''}) {
    return {
      AdditionalInfo: launchScript,
      ImageId: zoneImage(az),
      InstanceType: type,
      KeyName: sshKey,
      MinCount: 1,
      MaxCount: 1,
      Placement: {
        AvailabilityZone: az
      }
    }
  }
}