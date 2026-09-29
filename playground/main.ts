import { collection, createDB, DoxorError } from 'doxor.js'

type User = { id: number; name: string; email: string; age: number; tags: string[] }

const db = createDB({
  name: 'doxor-playground',
  collections: {
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('email', { unique: true })
      .index('name')
      .index('age')
      .index('tags', { multiEntry: true }),
  },
})

const schemaSource = `const db = createDB({
  name: 'doxor-playground',
  collections: {
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('email', { unique: true })
      .index('name')
      .index('age')
      .index('tags', { multiEntry: true }),
  },
})`

const $ = <E extends Element>(selector: string) => document.querySelector(selector) as E

const logList = $<HTMLOListElement>('#log')
function log(message: string, kind: 'event' | 'error' | 'ok' = 'ok'): void {
  const item = document.createElement('li')
  item.className = kind
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`
  logList.prepend(item)
}

async function attempt(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    const result = await action()
    log(`${label} → ${JSON.stringify(result) ?? 'done'}`)
  } catch (error) {
    if (error instanceof DoxorError)
      log(`${label} → DoxorError ${error.code}: ${error.message}`, 'error')
    else log(`${label} → ${String(error)}`, 'error')
  }
  await runQuery()
}

for (const event of ['versionchange', 'outdated', 'blocked', 'close'] as const) {
  db.on(event, (payload) =>
    log(`event: ${event} ${payload ? JSON.stringify(payload) : ''}`, 'event'),
  )
}

// Add a user
$<HTMLFormElement>('#add').addEventListener('submit', (event) => {
  event.preventDefault()
  const form = new FormData(event.target as HTMLFormElement)
  const user = {
    name: String(form.get('name')),
    email: String(form.get('email')),
    age: Number(form.get('age')),
    tags: String(form.get('tags'))
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  }
  void attempt(`insert(${JSON.stringify(user)})`, () => db.users.insert(user))
})

const samples: Omit<User, 'id'>[] = [
  { name: 'Ali', email: 'ali@example.com', age: 30, tags: ['admin', 'dev'] },
  { name: 'Amir', email: 'amir@example.com', age: 17, tags: ['dev'] },
  { name: 'Sara', email: 'sara@example.com', age: 25, tags: ['design'] },
  { name: 'Mina', email: 'mina@example.com', age: 41, tags: ['admin', 'design'] },
]
$('#seed').addEventListener('click', () =>
  attempt('insertMany(samples)', () =>
    db.users.insertMany(
      samples.map((user) => ({
        ...user,
        email: user.email.replace('@', `+${Date.now() % 100000}@`),
      })),
    ),
  ),
)
$('#clear').addEventListener('click', () => attempt('clear()', () => db.users.clear()))
$('#drop').addEventListener('click', () => attempt('db.delete()', () => db.delete()))

// Query
const queryForm = $<HTMLFormElement>('#query')
const indexSelect = queryForm.elements.namedItem('index') as HTMLSelectElement
for (const index of ['age', 'name', 'email', 'tags', 'id'])
  indexSelect.add(new Option(`'${index}'`, index))

const numeric = new Set(['age', 'id'])

function describeQuery() {
  const form = new FormData(queryForm)
  const index = String(form.get('index')) as 'age' | 'name' | 'email' | 'tags' | 'id'
  const op = String(form.get('op'))
  const raw = String(form.get('value'))
  const value = numeric.has(index) ? Number(raw) : raw
  const limit = String(form.get('limit'))
  const reverse = form.get('reverse') === 'on'
  let code = `await db.users.where('${index}')`
  if (op) code += `.${op}(${JSON.stringify(value)})`
  if (reverse) code += '.reverse()'
  if (limit) code += `.limit(${limit})`
  code += '.toArray()'
  return { index, op, value, limit, reverse, code }
}

async function runQuery(): Promise<void> {
  const { index, op, value, limit, reverse, code } = describeQuery()
  $('#code').textContent = code
  try {
    // biome-ignore lint/suspicious/noExplicitAny: the playground builds queries from form input
    let query: any = db.users.where(index)
    if (op) query = query[op](value)
    if (reverse) query = query.reverse()
    if (limit) query = query.limit(Number(limit))
    const users: User[] = await query.toArray()
    renderRows(users)
    $('#summary').textContent =
      `${users.length} result(s), ${await db.users.count()} user(s) in total`
  } catch (error) {
    renderRows([])
    $('#summary').textContent =
      error instanceof DoxorError ? `DoxorError ${error.code}: ${error.message}` : String(error)
  }
}

function renderRows(users: User[]): void {
  const body = $<HTMLTableSectionElement>('#rows')
  body.replaceChildren(
    ...users.map((user) => {
      const row = document.createElement('tr')
      for (const value of [user.id, user.name, user.email, user.age, user.tags.join(', ')]) {
        const cell = document.createElement('td')
        cell.textContent = String(value)
        row.append(cell)
      }
      const actions = document.createElement('td')
      const older = document.createElement('button')
      older.textContent = 'age + 1'
      older.className = 'secondary small'
      older.addEventListener('click', () =>
        attempt(`update(${user.id}, u => ({ ...u, age: u.age + 1 }))`, () =>
          db.users.update(user.id, (u) => ({ ...u, age: u.age + 1 })),
        ),
      )
      const remove = document.createElement('button')
      remove.textContent = 'delete'
      remove.className = 'danger small'
      remove.addEventListener('click', () =>
        attempt(`delete(${user.id})`, () => db.users.delete(user.id)),
      )
      actions.append(older, remove)
      row.append(actions)
      return row
    }),
  )
}

queryForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void runQuery()
})
queryForm.addEventListener('change', () => void runQuery())

$('#schema').textContent = schemaSource
void runQuery()
