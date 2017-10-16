#!/usr/bin/env node

if (process.argv[3] === '--help') {
  console.log(`
knork-dev-logger [file]

Pretty print a NDJSON log. If \`file\` is omitted, will read on stdin.
  `.trim())
  process.exit(1)
}

const {createReadStream} = require('fs')
const logger = require('./dev-logger')

const input = (
  process.argv[3]
  ? createReadStream(process.argv[3])
  : process.stdin
)
input.pipe(logger()).pipe(process.stdout)
