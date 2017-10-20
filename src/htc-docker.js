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
  let result = typeof cmd === 'string' ? sh.exec(cmd) : cmd()
  let code = !(result.code)
  if (okIsNotOk) {
    code = !code
  }
  if (code) {
    msgOk && log(msgOk)
    return result.stdout
  }
  error(msgFail)
}

const execAndFailIfOk = (cmd, msgFail, msgOk) => execOrFail(cmd, msgFail, msgOk, true)
const exec = (cmd) => sh.exec(cmd).code === 0

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

const readFile = (filename) => {
  try {
    return fs.readFileSync(path.join(process.cwd(), filename), 'utf8')
  } catch (e) {
    error(`Cannot find file ${filename} in cwd`)
  }
}

const readLockFile = () => {
  try {
    return lockfile.parse(readFile('yarn.lock'))
  } catch (e) {
    error('Cannot parse yarn.lock file')
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
  const { register_url } = argv
  const version = getVersionFromPackageJSON()

  const dockerFile = readFile('Dockerfile')

  const packages = readLockFile().object
  const packagesSign = Object
    .keys(packages)
    .map(k => packages[k].resolved)
    .join('_$_')

  const baseImageHash = sha1(dockerFile, packagesSign)
  const baseImageURL = `${register_url}/base:${baseImageHash}`
  log(`Base image url is ${baseImageURL}`)

  const tryToPush = (imageURL) => {
    execOrFail(
      `docker push ${imageURL}`,
      `Cannot push ${imageURL}`
    )
  }
  if (!exec(`docker pull ${baseImageURL}`)) {
    execOrFail(
      `docker build -t ${baseImageURL} .`,
      `Cannot build base image ${baseImageURL}`
    )
    tryToPush(baseImageURL)
  }

  const COMMIT_HASH = execOrFail(
    `git rev-parse HEAD`,
    'git doesn\'t work'
  ).trim() // because of \n

  const imageProductionURL = `${register_url}/production:${version}`
  const imageStagingURL = `${register_url}/staging:${version}`

  const tryToPull = (imageURL) => {
    execAndFailIfOk(
      `docker pull ${imageURL}`,
      `Image ${imageURL} already exist`
    )
  }
  tryToPull(imageStagingURL)
  tryToPull(imageProductionURL)

  const newDockerContent = readFile('DockerfileTmp')
    .replace(/FROM\s+[^\s]+\s+/, `FROM ${baseImageURL}\n`)
    .replace(/\n{2,}/g, '\n')

  const tryToBuild = (imageURL, BACKEND) => {
    const args = [
      `--build-arg BACKEND=${BACKEND}`,
      `--build-arg COMMIT_HASH=${COMMIT_HASH}`,
      `--tag ${imageURL}`,
    ]
    execOrFail(
      () => sh.echo(newDockerContent).exec(`docker build ${args.join(' ')} -`),
      `Image ${imageURL} build failed`
    )
  }
  tryToBuild(imageStagingURL, 'staging')
  tryToBuild(imageProductionURL, 'production')

  // tryToPush(imageStagingURL)
  // tryToPush(imageProductionURL)
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
