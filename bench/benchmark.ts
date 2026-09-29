import Dexie from 'dexie'
import { deleteDB, openDB } from 'idb'
import { collection, createDB } from '../src/index.js'

type User = {
  id?: number
  name: string
  age: number
}

const RECORD_COUNT = 10_000
const WARMUP_RUNS = 2
const MEASURED_RUNS = 7

const records: User[] = Array.from({ length: RECORD_COUNT }, (_, i) => ({
  name: `User ${i}`,
  age: 18 + (i % 63),
}))

const browserElement = document.querySelector('#browser') as HTMLParagraphElement
const statusElement = document.querySelector('#status') as HTMLParagraphElement
const resultsElement = document.querySelector('#results') as HTMLTableSectionElement
const runButton = document.querySelector('#run') as HTMLButtonElement

browserElement.textContent = `Browser: ${navigator.userAgent}`

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] as number
}

async function measure(action: () => Promise<void>): Promise<number> {
  const start = performance.now()
  await action()
  return performance.now() - start
}

function createDoxorDB(name: string) {
  return createDB({
    name,
    collections: {
      users: collection<User>().key('id', { autoIncrement: true }).index('age'),
    },
  })
}

async function benchmarkDoxor() {
  const insertTimes: number[] = []
  const queryTimes: number[] = []
  const arrayTimes: number[] = []

  for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
    const dbName = `benchmark-doxor-${crypto.randomUUID()}`
    const db = createDoxorDB(dbName)

    try {
      await db.users.count()

      const insertTime = await measure(async () => {
        await db.users.insertMany(records)
      })

      const queryTime = await measure(async () => {
        const result = await db.users.where('age').between(30, 50).toArray()

        if (result.length === 0) {
          throw new Error('Query returned no records')
        }
      })

      const arrayTime = await measure(async () => {
        const result = await db.users.toArray()

        if (result.length !== RECORD_COUNT) {
          throw new Error(`Expected ${RECORD_COUNT} records`)
        }
      })

      if (run >= WARMUP_RUNS) {
        insertTimes.push(insertTime)
        queryTimes.push(queryTime)
        arrayTimes.push(arrayTime)
      }
    } finally {
      await db.delete()
    }
  }

  return {
    insert: median(insertTimes),
    query: median(queryTimes),
    array: median(arrayTimes),
  }
}

async function benchmarkIdb() {
  const insertTimes: number[] = []
  const queryTimes: number[] = []
  const arrayTimes: number[] = []

  for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
    const dbName = `benchmark-idb-${crypto.randomUUID()}`

    try {
      const db = await openDB(dbName, 1, {
        upgrade(database) {
          const store = database.createObjectStore('users', {
            keyPath: 'id',
            autoIncrement: true,
          })

          store.createIndex('age', 'age')
        },
      })

      try {
        const insertTime = await measure(async () => {
          const tx = db.transaction('users', 'readwrite')

          for (const record of records) {
            tx.store.add(record)
          }

          await tx.done
        })

        const queryTime = await measure(async () => {
          const result = await db.getAllFromIndex(
            'users',
            'age',
            IDBKeyRange.bound(30, 50, false, true),
          )

          if (result.length === 0) {
            throw new Error('Query returned no records')
          }
        })

        const arrayTime = await measure(async () => {
          const result = await db.getAll('users')

          if (result.length !== RECORD_COUNT) {
            throw new Error(`Expected ${RECORD_COUNT} records`)
          }
        })

        if (run >= WARMUP_RUNS) {
          insertTimes.push(insertTime)
          queryTimes.push(queryTime)
          arrayTimes.push(arrayTime)
        }
      } finally {
        db.close()
      }
    } finally {
      await deleteDB(dbName)
    }
  }

  return {
    insert: median(insertTimes),
    query: median(queryTimes),
    array: median(arrayTimes),
  }
}

async function benchmarkDexie() {
  const insertTimes: number[] = []
  const queryTimes: number[] = []
  const arrayTimes: number[] = []

  for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
    const dbName = `benchmark-dexie-${crypto.randomUUID()}`
    const db = new Dexie(dbName)

    try {
      db.version(1).stores({
        users: '++id, age',
      })

      await db.open()

      const insertTime = await measure(async () => {
        await db.table<User>('users').bulkAdd(records)
      })

      const queryTime = await measure(async () => {
        const result = await db.table<User>('users').where('age').between(30, 50).toArray()

        if (result.length === 0) {
          throw new Error('Query returned no records')
        }
      })

      const arrayTime = await measure(async () => {
        const result = await db.table<User>('users').toArray()

        if (result.length !== RECORD_COUNT) {
          throw new Error(`Expected ${RECORD_COUNT} records`)
        }
      })

      if (run >= WARMUP_RUNS) {
        insertTimes.push(insertTime)
        queryTimes.push(queryTime)
        arrayTimes.push(arrayTime)
      }
    } finally {
      db.close()
      await db.delete()
    }
  }

  return {
    insert: median(insertTimes),
    query: median(queryTimes),
    array: median(arrayTimes),
  }
}

function addResult(library: string, result: { insert: number; query: number; array: number }) {
  const row = document.createElement('tr')

  row.innerHTML = `
    <td>${library}</td>
    <td>${result.insert.toFixed(2)}</td>
    <td>${result.query.toFixed(2)}</td>
    <td>${result.array.toFixed(2)}</td>
  `

  resultsElement.appendChild(row)
}

async function runBenchmark() {
  runButton.disabled = true
  resultsElement.innerHTML = ''
  statusElement.textContent = 'Running benchmark...'

  try {
    const doxorResult = await benchmarkDoxor()
    addResult('doxor.js', doxorResult)

    const idbResult = await benchmarkIdb()
    addResult('idb', idbResult)

    const dexieResult = await benchmarkDexie()
    addResult('Dexie', dexieResult)

    statusElement.textContent = `Completed: ${WARMUP_RUNS} warm-up runs + ${MEASURED_RUNS} measured runs. Median shown in milliseconds.`
  } catch (error) {
    console.error(error)
    statusElement.textContent = `Benchmark failed: ${error}`
  } finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', runBenchmark)
