const test = require('tape')
const SRWCache = require('./')

const MAX_AGE = 1 * 1000 // 1 second
const STALE_WHILE_REVALIDATE = 5 * 1000 // 5 seconds
const TIME_TO_VALIDATE = 1 * 1000 // 1 second

const key = 'foobar'
const params = { hello: 'world' }
const get = SRWCache({
  maxAge: MAX_AGE,
  staleWhileRevalidate: STALE_WHILE_REVALIDATE,
  validate: async params => {
    await new Promise(resolve => setTimeout(resolve, TIME_TO_VALIDATE))
    return {
      n: 42
    }
  }
})

test('First hit', async t => {
  t.plan(2)

  const start = Date.now()
  const value = await get({ key, params })
  const time = Date.now() - start

  t.ok(time > 500, 'First hit takes more than 500ms to complete')
  t.equals(value.n, 42, 'Cache has correct stored value')
})

test('Second hit - from cache', async t => {
  t.plan(2)

  const start = Date.now()
  const value = await get({ key, params })
  const time = Date.now() - start

  t.ok(time < 50, 'Second hit is from cache and takes less than 50ms to complete')
  t.equals(value.n, 42, 'Cache has correct stored value')
})

test('Third hit - Is stale, but quickly returned', async t => {
  t.plan(2)

  await new Promise(resolve => setTimeout(resolve, MAX_AGE + 100)) // Wait MAX_AGE plus 100 ms

  const start = Date.now()
  const value = await get({ key, params })
  const time = Date.now() - start

  t.ok(time < 50, 'Third hit is stale, but from cache, and takes less than 50ms to complete')
  t.equals(value.n, 42, 'Cache has correct stored value')
})

test('Fourth hit - Is stale, and too old to validate. Cache should not be used, and then take more than 500ms to complete', async t => {
  t.plan(2)

  await new Promise(resolve => setTimeout(resolve, MAX_AGE + STALE_WHILE_REVALIDATE + TIME_TO_VALIDATE + 100)) // Wait MAX_AGE + STALE_WHILE_REVALIDATE + TIME_TO_VALIDATE plus 100 ms

  const start = Date.now()
  const value = await get({ key, params })
  const time = Date.now() - start

  t.ok(time > 500, 'Fourth hit is stale and too old to validate, so should take more than 500ms to complete')
  t.equals(value.n, 42, 'Cache has correct stored value')
})

test('Allow caching of undefined values', async t => {
  t.plan(4)

  let calls = 0
  const get = SRWCache({
    maxAge: MAX_AGE,
    staleWhileRevalidate: STALE_WHILE_REVALIDATE,
    validate: () => {
      calls += 1
      return undefined
    }
  })

  const firstValue = await get({ key, params })
  t.equals(firstValue, undefined, 'First returned undefined')
  t.equals(calls, 1, 'Was called once')

  const secondValue = await get({ key, params })
  t.equals(secondValue, undefined, 'Returned value is still undefined')
  t.equals(calls, 1, 'Was not called again, and used cached value')
})

test('Throws in validation method should throw in get method', async t => {
  t.plan(1)

  const errorMessage = 'some error text'
  const get = SRWCache({
    maxAge: MAX_AGE,
    staleWhileRevalidate: STALE_WHILE_REVALIDATE,
    validate: () => {
      throw new Error(errorMessage)
    }
  })

  try {
    await get({ key, params })
    t.fail('This line should not be executed, as the validation throws an error')
  } catch (err) {
    t.equals(err.message, errorMessage, 'Error thrown had correct message')
  }
})

test('Promise rejection in validation method should throw in get method', async t => {
  t.plan(1)

  const errorMessage = 'Something was unavailable'
  const get = SRWCache({
    maxAge: MAX_AGE,
    staleWhileRevalidate: STALE_WHILE_REVALIDATE,
    validate: () => new Promise((resolve, reject) => setTimeout(() => reject(new Error(errorMessage)), 100))
  })

  try {
    await get({ key, params })
    t.fail('This line should not be executed, as the validation throws an error')
  } catch (err) {
    t.equals(err.message, errorMessage, 'Error thrown had correct message')
  }
})

test('If there are several pending validate promises, they should all reject', async t => {
  t.plan(4)

  const errorMessage = 'Something was unavailable'
  const get = SRWCache({
    maxAge: MAX_AGE,
    staleWhileRevalidate: STALE_WHILE_REVALIDATE,
    validate: () => new Promise((resolve, reject) => setTimeout(() => reject(new Error(errorMessage)), 100))
  })

  asyncGet()
  asyncGet()
  asyncGet()
  asyncGet()

  async function asyncGet () {
    try {
      await get({ key, params })
      t.fail('This line should not be executed, as the validation throws an error')
    } catch (err) {
      t.equals(err.message, errorMessage, 'Error thrown had correct message')
    }
  }
})

test('Some async thing', async t => {
  t.plan(1)

  const errorMessage = 'Some async error'
  async function someErrornousAsyncMethod () {
    return new Promise((resolve, reject) => setTimeout(() => reject(new Error(errorMessage))))
  }
  const get = SRWCache({
    maxAge: MAX_AGE,
    staleWhileRevalidate: STALE_WHILE_REVALIDATE,
    validate: async () => {
      await someErrornousAsyncMethod()
      return 'This should never be returned as the previous line rejects'
    }
  })

  try {
    await get({ key, params })
    t.fail('This line should not be executed, as the validation throws an error')
  } catch (err) {
    t.equals(err.message, errorMessage, 'Error thrown had correct message')
  }
})
