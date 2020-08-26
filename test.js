'use strict'

if (process.env.TZ !== 'UTC') {
  throw new Error('re run the tests with TZ=UTC')
}

const {Readable} = require('stream')
const concat = require('concat-stream')
const {test} = require('tap')
const util = require('util')

const createLogger = require('./dev-logger.js')

test('ungrouped', async assert => {
  const logger = createLogger()
  const result = await collect(
    flush(nljson({
      name: `hello:${id()}`
    }, {
      name: `there:${id()}`
    })).pipe(logger)
  )
  assert.equal(result, "{ name: \u001b[32m'hello:MQ=='\u001b[39m }\n{ name: \u001b[32m'there:Mg=='\u001b[39m }\n")
})

const statuses = [200, 300, 400, 500]

statuses.forEach(status => {
  test(`grouped (${status})`, async assert => {
    id.id = 0
    const logger = createLogger()
    const currentId = id()
    const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
    const result = await collect(
      flush(nljson({
        name: `request:${currentId}`,
        req: {
          method: 'GET',
          url: '/foo'
        },
        time: date
      }, {
        name: `request:${currentId}`,
        statusCode: status,
        latency: 10,
        time: date
      })).pipe(logger)
    )
    assert.equal(result, `00:00:00 ${status}     10ms    GET /foo (id: 📖 )\n`)
  })
})

test('grouped (ignores unknown finish)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    }, {
      name: `request:Mz==`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n')
})

test('grouped (capture logs)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `womp:${currentId}`,
      message: 'geez wow',
      level: 'error',
      time: date2
    }, {
      name: `womp:${currentId}`,
      message: 'geez wow',
      level: 'warn',
      time: date2
    }, {
      name: `womp:${currentId}`,
      message: 'geez wow',
      time: date2
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s ERR womp geez wow\n    +50s WRN womp geez wow\n    +50s LOG womp geez wow\n')
})

test('grouped (treats repeated start as grouped item)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +0ms LOG request GET /foo\n')
})

test('passes unparsable lines through', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }) + '\nhello world\n' + nljson({
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, 'hello world\n00:00:00 200     10ms    GET /foo (id: 📖 )\n')
})

test('passes unparsable lines through', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }) + '\nhello world\n' + nljson({
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, 'hello world\n00:00:00 200     10ms    GET /foo (id: 📖 )\n')
})

test('non-spife request ids are passed through', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z')).toISOString()
  const obj = {
    name: 'foo:aBx',
    message: 'baz',
    time: date
  }
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, obj, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, util.inspect(obj, {colors: true}) + '\n00:00:00 200     10ms    GET /foo (id: 📖 )\n')
})

test('grouped (ignores repeated finish)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n')
})

test('grouped (capture logs that happen "after" the fact)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    }, {
      name: `womp:${currentId}`,
      message: 'geez wow',
      time: date2
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s LOG womp geez wow (after 📖 )\n')
})

test('handles nameless events', async assert => {
  id.id = 0
  const logger = createLogger()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z')).toISOString()
  const obj = {
    message: 'foo',
    time: date
  }
  const result = await collect(
    flush(nljson(obj)).pipe(logger)
  )
  assert.equal(result, util.inspect(obj, {colors: true}) + '\n')
})

test('grouped (handles errors)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))

  const stl = Error.stackTraceLimit
  Error.stackTraceLimit = 1
  const stack = new Error().stack.replace(/\d+/g, 'N')
  Error.stackTraceLimit = stl
  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `womp:${currentId}`,
      err: {
        stack
      },
      level: 'error',
      time: date2
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.match(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s ERR womp Error\n                  at Test.test')
})

test('grouped (handles errors w/no stack)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))

  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `womp:${currentId}`,
      err: {
        message: 'oh no'
      },
      level: 'error',
      time: date2
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s ERR womp oh no\n')
})

test('grouped (handles errors w/no stack + no message)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))

  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `womp:${currentId}`,
      err: {},
      level: 'error',
      time: date2
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s ERR womp Unknown Error\n')
})

test('grouped (handles logs with no message)', async assert => {
  id.id = 0
  const logger = createLogger()
  const currentId = id()
  const date = new Date(Date.parse('2017-01-03T00:00:00Z'))
  const date2 = new Date(Date.parse('2017-01-03T00:00:50Z'))

  const result = await collect(
    flush(nljson({
      name: `request:${currentId}`,
      req: {
        method: 'GET',
        url: '/foo'
      },
      time: date
    }, {
      name: `womp:${currentId}`,
      time: date2
    }, {
      name: `request:${currentId}`,
      statusCode: 200,
      latency: 10,
      time: date
    })).pipe(logger)
  )
  assert.equal(result, '00:00:00 200     10ms    GET /foo (id: 📖 )\n    +50s LOG womp Unknown message\n')
})

function id () {
  id.id = id.id || 0
  ++id.id
  return Buffer.from(String(id.id)).toString('base64')
}

function nljson (...args) {
  return args.map(xs => JSON.stringify(xs)).join('\n')
}

function flush (content) {
  const stream = new Readable({
    read () {}
  })
  stream.push(content)
  stream.push(null)
  return stream
}

function collect (stream) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject).pipe(concat(buf => {
      resolve(buf.toString())
    })).on('error', reject)
  })
}
