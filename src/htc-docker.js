const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const sh = require('shelljs')
const lockfile = require('@yarnpkg/lockfile')

const { argv } = require('yargs')
  .command('release <register_url>', 'build docker and push to register')
  .command('releasefront <register_url>', 'build docker for static and push to register')
  .help('h')
  .alias('h', 'help')
  .alias('v', 'version')

const log = (s) => console.log('htc-docker OK: ' + s)
const logerr = (s) => console.error('htc-docker ERROR: ' + s)
const error = (s) => {
  logerr(s)
  sh.exit(1)
}

const getVersionFromPackageJSON = () => {
  try {
    return require(path.join(process.cwd(), 'package.json')).version
  } catch (e) {
    error('No package.json in cwd')
  }
}

const execOrFail = (cmd, msgFail, msgOk = '', okIsNotOk = false) => {
  let code = !(sh.exec(cmd).code)
  if (okIsNotOk) {
    code = !code
  }
  if (code) {
    msgOk && log(msgOk)
  } else {
    error(msgFail)
  }
}

const execAndFailIfOk = (cmd, msgFail, msgOk) => execOrFail(cmd, msgFail, msgOk, true)
const exec = (cmd, msg) => sh.exec(cmd).code === 0

// CMDS section

const release = () => {
  const version = getVersionFromPackageJSON()
  const imageURL = argv.register_url + ':' + version
  log(`Image url is ${imageURL}`)

  execAndFailIfOk(
    `docker pull ${imageURL}`,
    `Docker image ${imageURL} already exist`,
    'Previous "not found" is OK here',
  )
  execOrFail(
    `docker build -t ${imageURL} .`,
    `Cannot build image ${imageURL}`
  )
  execOrFail(
    `docker push ${imageURL}`,
    `Cannot push image ${imageURL}`
  )

  log(`Image ${imageURL} successfully pushed to register`)
}

const readLockFile = () => {
  try {
    const lockPath = path.join(process.cwd(), 'yarn.lock')
    const lockContent = fs.readFileSync(lockPath, 'utf8')
    return lockfile.parse(lockContent)
  } catch (e) {
    error('Cannot find or parse yarn.lock file in cwd')
  }
}

const readDockerFile = () => {
  try {
    const dockerfilePath = path.join(process.cwd(), 'Dockerfile')
    return fs.readFileSync(dockerfilePath, 'utf8')
  } catch (e) {
    error('Cannot find Dockerfile in cwd or find FROM cmd in Dockerfile')
  }
}

const sha1 = (...args) => {
  const h = crypto.createHash('sha1')
  for (const a of args) {
    h.update(a)
  }
  return h.digest('hex')
}

const releasefront = () => {
  const version = getVersionFromPackageJSON()
  
  const dockerFile = readDockerFile()

  const packages = readLockFile().object
  const packagesSign = Object
    .keys(packages)
    .map(k => packages[k].resolved)
    .join('_$_')

  const baseImageHash = sha1(dockerFile, packagesSign)
  const baseImageURL = `${argv.register_url}/base/${baseImageHash}`
  log(`Base image url is ${baseImageURL}`)

  if (!exec(`docker pull ${baseImageURL}`)) {
    execOrFail(
      `docker push -t ${baseImageURL}`,
      `Cannot push ${baseImageURL}`
    )
  }
}


// hash with all cmds
const cmds = {
  release,
  releasefront,
}

// just run some cmd
const cmdFunc = cmds[argv._[0]]
if (cmdFunc) {
  cmdFunc()
} else {
  error('Cmd is not found, use -h or --help for info')
}
