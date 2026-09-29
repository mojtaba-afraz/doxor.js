// A minimal doxor.js app. Fork it on StackBlitz to reproduce a bug.
import { collection, createDB, DoxorError } from 'doxor.js'

const db = createDB({
  name: 'todos-example',
  collections: {
    todos: collection().key('id', { autoIncrement: true }).index('done'),
  },
})

const list = document.querySelector('#todos')
const errorText = document.querySelector('#error')

async function render() {
  const todos = await db.todos.toArray()
  list.replaceChildren(
    ...todos.map((todo) => {
      const item = document.createElement('li')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = todo.done === 1
      box.addEventListener('change', () =>
        run(() => db.todos.update(todo.id, { done: box.checked ? 1 : 0 })),
      )
      item.append(box, ` ${todo.title}`)
      return item
    }),
  )
  const open = await db.todos.where('done').equals(0).count()
  document.title = `${open} open · doxor.js example`
}

async function run(action) {
  errorText.textContent = ''
  try {
    await action()
  } catch (error) {
    errorText.textContent =
      error instanceof DoxorError ? `${error.code}: ${error.message}` : String(error)
  }
  await render()
}

document.querySelector('#add').addEventListener('submit', (event) => {
  event.preventDefault()
  const form = event.target
  const title = new FormData(form).get('title')
  form.reset()
  // Booleans are not valid IndexedDB keys, so the indexed `done` flag is stored as 0 or 1.
  run(() => db.todos.insert({ title, done: 0 }))
})

render()
