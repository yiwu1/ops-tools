const async = require('async')
const {red, yellow, green} = require('@buzuli/color')
const {head} = require('ramda')
const newEc2 = require('../lib/ec2')
const regions = require('../lib/aws-regions')

// Copy an AMI from another region to the current region.
function copyImage ({ec2, srcRegion, srcAmi, amiName, amiDesc}) {
  return new Promise((resolve, reject) => {
    const options = {
      SourceRegion: srcRegion,
      SourceAmi: srcAmi,
      Name: amiName,
      Description: amiDesc
    }

    ec2.api.copyImage(options, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve({
          ami: data.ImageId
        })
      }
    })
  })
}

function publishImage ({ec2, ami}) {
  return new Promise((resolve, reject) => {
    // Make the image public.
    const region = ec2.aws.region
    const options = {
      ImageId: ami,
      Attribute: 'launchPermission',
      LaunchPermission: {
        Add: [{Group: 'all'}]
      }
    }

    ec2.api.modifyImageAttribute(options, (error, data) => {
      if (error) {
        console.error(error)
        console.error(red(
          `Error updating image ${yellow(ami)} in region ${yellow(region)} : details above`
        ))

        reject(error)
      } else {
        console.log(data)
        console.log(green(`Updated image ${yellow(ami)} in region ${yellow(region)}`))

        resolve({
          ami,
          region,
          published: true
        })
      }
    })
  })
}

function replicateImage ({srcRegion, srcAmi, dstRegion, amiName, amiDesc, publish}) {
  const ec2 = newEc2({region: dstRegion})

  return getImageInfo({srcRegion, srcAmi})
  .then(({name, description}) => {
    return copyImage({
      ec2,
      dstRegion,
      srcAmi,
      amiName: amiName || name,
      amiDesc: amiDesc || description
    })
  })
  .then(({ami}) => {
    if (publish) {
      return publishImage({ec2, region: dstRegion, ami})
    } else {
      return {
        ami,
        region: ec2.aws.region,
        published: false
      }
    }
  })
}

function getImageInfo ({srcRegion, srcAmi}) {
  return new Promise((resolve, reject) => {
    const ec2 = newEc2({region: srcRegion})

    const options = {
      ImageIds: [srcAmi]
    }

    ec2.api.describeImages(options, (error, data) => {
      if (error) {
        reject(error)
      } else {
        const img = head(data.Images)
        resolve({
          name: img.Name,
          description: img.Description,
          public: img.Public
        })
      }
    })
  })
}

// Run through all regions
function handler (argv) {
  const publish = true // defaults to true
  let srcRegion // Required
  let srcAmi // Required
  let amiName // Should pull name from source image if the name is not supplied
  let amiDesc // Should pull name from source image if the name is not supplied

  // Map each region to a replicator function.
  const actions = regions.general.map(dstRegion => {
    return next => {
      replicateImage({srcRegion, srcAmi, dstRegion, amiName, amiDesc, publish})
      .then(next, next)
    }
  })

  // Process the regions in sequence.
  async.series(actions, error => {
    console.error(error)
    console.error(red(`Error replicating image ${srcRegion}:${srcAmi} :`), 'details above')
  })
}

function builder (yargs) {
  return yargs
    .option('name', {
      type: 'string',
      desc: 'AMI name (defaults to that of the source AMI)'
    })
    .option('description', {
      type: 'string',
      desc: 'AMI description (defaults to that of the source AMI)'
    })
}

module.exports = {
  command: 'replicate-ami <src-region> <src-ami>',
  desc: 'replicate an AMI from one region to all others',
  builder,
  handler
}
