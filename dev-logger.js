'use strict'

module.exports = createDevLogger

const combiner = require('stream-combiner')
const baseEmoji = require('base-emoji')
const prettyMS = require('pretty-ms')
const through2 = require('through2')
const crypto = require('crypto')
const chalk = require('chalk')
const split = require('split')
const util = require('util')

function colorFor (str) {
  const pool = [
    'cyan',
    'magenta',
    'yellow',
    'green',
    'red',
    'blue'
  ]
  const idx = crypto.createHash('md5').update(str).digest()[0] % pool.length
  return pool[idx]
}

class LogItem {
  constructor (segments, json, epoch) {
    this.json = json
    this.name = segments.slice(0, -1).join(':')
    this.start = Date.parse(json.time)
    this.delta = this.start - epoch
    this.pool = colorFor(this.name)
  }

  flush (last) {
    const level = (
      this.json.level === 'error'
      ? chalk.bgRed(chalk.white('ERR'))
      : (
        this.json.level === 'warn'
        ? chalk.bgYellow(chalk.black('WRN'))
        : chalk.bgCyan(chalk.black('LOG'))
      )
    )

    const initial = [
      `+${prettyMS(this.delta)}`.padStart(8),
      level
    ]

    const message = (
      this.json.err
      ? this.json.err.stack || this.json.err.message || 'Unknown Error'
      : (
        this.json.req
        ? `${this.json.req.method} ${this.json.req.url}`
        : String(
          this.json.message ||
          'Unknown message'
        )
      )
    )
    const line = [
      chalk.gray(initial[0]),   // N
      initial[1],               // 3
      chalk[this.pool](this.name),
      message.split('\n').map((xs, idx) => {
        if (this.json.level === 'error') {
          xs = (
            idx === 0
            ? chalk.bgRed(chalk.white(xs))
            : chalk.gray(xs)
          )
        }
        return (
          idx > 0
          ? `${' '.repeat(initial[0].length + initial[1].length + this.name.length + 3)}${xs.trim()}`
          : xs
        )
      }).join('\n')
    ]
    return line.join(' ')
  }
}

class Logger {
  constructor (id, json) {
    this.id = id
    this.json = json
    this.actions = []
    this.start = Date.parse(json.time)
    this.flushed = false
    this.humanId = [...baseEmoji.toUnicode(Buffer.from(this.id, 'base64'))].slice(0, 4).join(' ') + ' '
  }

  add (segments, json) {
    if (this.flushed) {
      const item = new LogItem(segments, json, this.start)
      return item.flush() + ` (after ${this.humanId})`
    }
    this.actions.push(new LogItem(segments, json, this.start))
  }

  flush (json, evict) {
    if (this.flushed) {
      return
    }

    this.flushed = true
    // time CODE NNNms method url
    // |- +10ms <message>
    // |- +11ms <message>
    // |- +12ms <message>
    // |- +13ms <message>
    const statusCode = (
      json.statusCode < 299
      ? chalk.green(json.statusCode)
      : (
        json.statusCode < 399
        ? chalk.bgGreen(chalk.white(json.statusCode))
        : (
          json.statusCode < 499
          ? chalk.yellow(json.statusCode)
          : chalk.bgRed(chalk.white(json.statusCode))
        )
      )
    )

    const line = [
      chalk.underline(
        chalk.gray(new Date(Date.parse(this.json.time)).toLocaleTimeString())
      ),
      statusCode,
      chalk.gray(prettyMS(json.latency).padStart(8)),
      this.json.req.method.padStart('DELETE'.length),
      chalk.underline(this.json.req.url),
      `(id: ${this.humanId})`
    ].join(' ')
    const actions = this.actions.map(
      xs => xs.flush()
    ).join('\n').split(this.id).join(this.humanId)
    setTimeout(evict, 33)
    return `${line}${actions ? '\n' + actions : ''}`
  }
}

function createDevLogger () {
  const extant = new Map()

  return combiner(split(), through2(write))

  function write (chunk, enc, next) {
    try {
      const json = JSON.parse(chunk)
      const segments = (json.name || '').split(':')
      const id = segments[segments.length - 1]

      if (!id || id.slice(-2) !== '==') {
        this.push(util.inspect(json, {colors: true}) + '\n')
        return next()
      }

      const output = (
        segments[0] === 'request' && json.req
        ? start(id, segments, json)
        : (
          segments[0] === 'request' && json.statusCode
          ? finish(id, segments, json)
          : group(id, segments, json)
        )
      )

      if (typeof output === 'string') {
        this.push(output + '\n')
      }
    } catch (err) {
      this.push(chunk + '\n')
    }
    next()
  }

  function start (id, segments, json) {
    if (extant.has(id)) {
      return group(id, segments, json)
    }
    extant.set(id, new Logger(id, json))
  }

  function finish (id, segments, json) {
    if (!extant.has(id)) {
      // already finished!
      return
    }

    return extant.get(id).flush(json, () => {
      extant.delete(id)
    })
  }

  function group (id, segments, json) {
    if (!extant.has(id)) {
      // this might be an ungrouped item!
      return util.inspect(json, {colors: true})
    }

    return extant.get(id).add(segments, json)
  }
}
