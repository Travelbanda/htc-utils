const path = require('path')
const sh = require('shelljs')
// sh.config.verbose = true

const {argv} = require('yargs')
  .command('release <register_url>', 'build docker and push to register')
  .help('h')
  .alias('h', 'help')
  .alias('v', 'version')

const getVersionFromPackageJSON = () => {
  return require(path.join(process.cwd(), 'package.json')).version
}

const echo = (s) => sh.echo('\nhtc-docker: ' + s)

const release = () => {
  const version = getVersionFromPackageJSON()
  const imageURL = argv.register_url + ':' + version

  if (sh.exec(`docker pull ${imageURL}`).code === 0) {
    echo(`Docker image ${imageURL} already exist`)
    sh.exit(1);
  } else {
    echo('It\'s OK')
  }

  if (sh.exec(`docker build -t ${imageURL} .`).code !== 0) {
    echo(`Cannot build image ${imageURL}`)
    sh.exit(1)
  }

  if (sh.exec(`docker push ${imageURL}`).code !== 0) {
    echo(`Cannot push image ${imageURL}`)
    sh.exit(1)
  }
}

// hash with all cmds
const cmds = { release }

// just run some cmd
cmds[argv._[0]]()
