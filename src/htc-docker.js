const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const sh = require('shelljs')
// const lockfile = require('@yarnpkg/lockfile')

const { argv }  = require('yargs')
  .command('release [dontpush] <register_url>', 'build docker and push to register')
  .command('releasefront [dontpush] <register_url>', 'build docker for static and push to register')
  .help('h')
  .boolean('dontpush')
  .alias('h', 'help')
  .alias('v', 'version')

const { dontpush, register_url } = argv

const log = (s) => console.log('htc-docker OK: ' + s)
const logerr = (s) => console.error('htc-docker ERROR: ' + s)
const error = (s) => {
  logerr(s)
  sh.exit(1)
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

const protectedRun = (f, msgFail) => {
  try {
    return f()
  } catch (e) {
    error(msgFail)
  }
}

const readFile = (filename) => protectedRun(
  () => fs.readFileSync(path.join(process.cwd(), filename), 'utf8'),
  `Cannot find file ${filename} in cwd`
)

const getVersionFromPackageJSON = () => protectedRun(
  () => require(path.join(process.cwd(), 'package.json')).version,
  'No package.json in cwd'
)

// const readYarnLockFile = () => protectedRun(
//   () => lockfile.parse(readFile('yarn.lock')),
//   'Cannot parse yarn.lock file'
// )

const sha1 = (...args) => {
  const h = crypto.createHash('sha1')
  args.forEach((a) => h.update(a))
  return h.digest('hex')
}

const tryToDockerPush = (imageURL) => execOrFail(
  `docker push ${imageURL}`,
  `Cannot push ${imageURL}`
)
const tryToDockerPull = (imageURL) => execAndFailIfOk(
  `docker pull ${imageURL}`,
  `Image ${imageURL} already exist`
)

const release = () => {
  const version = getVersionFromPackageJSON()
  const imageURL = register_url + ':' + version
  log(`Image url is ${imageURL}`)

  tryToDockerPull(imageURL)
  log('Previous "not found" is OK here')

  execOrFail(
    `docker build -t ${imageURL} .`,
    `Cannot build image ${imageURL}`
  )
  if (!dontpush) {
    tryToDockerPush(imageURL)
  }
  log(`Image ${imageURL} successfully pushed to register`)
}

const releasefront = () => {
  const version = getVersionFromPackageJSON()

  // const dockerFile = readFile('Dockerfile')

  // const packages = readYarnLockFile().object
  // const packagesSign = Object
  //   .keys(packages)
  //   .map(k => packages[k].resolved)
  //   .join('_$_')

  // const baseImageHash = sha1(dockerFile, packagesSign)
  const baseImageURL = `${register_url}/base:${version}`
  log(`Base image url is ${baseImageURL}`)
  tryToDockerPull(baseImageURL)

  // if (!exec(`docker pull ${baseImageURL}`)) {
  //   execOrFail(
  //     `docker build -t ${baseImageURL} .`,
  //     `Cannot build base image ${baseImageURL}`
  //   )
  //   if (!dontpush) {
  //     tryToDockerPush(baseImageURL)
  //   }
  // }

  const COMMIT_HASH = execOrFail(
    `git rev-parse HEAD`,
    'git doesn\'t work'
  ).trim() // because of \n

  const imageProductionURL = `${register_url}/production:${version}`
  const imageStagingURL = `${register_url}/staging:${version}`

  tryToDockerPull(imageStagingURL)
  tryToDockerPull(imageProductionURL)

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

  if (!dontpush) {
    tryToDockerPush(imageStagingURL)
    tryToDockerPush(imageProductionURL)
  }

  log('Staging and production images successfully pushed to register')
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
