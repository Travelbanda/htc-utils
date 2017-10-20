const path = require('path')

const sh = require('shelljs')

const { argv } = require('yargs')
  .command('release <register_url>', 'build docker and push to register')
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


// hash with all cmds
const cmds = {
  release,
}

// just run some cmd
const cmdFunc = cmds[argv._[0]]
if (cmdFunc) {
  cmdFunc()
} else {
  error('Cmd is not found, use -h or --help for info')
}
