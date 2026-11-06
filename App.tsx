import { DoxorError } from 'doxor.js'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { db, type Todo } from './db'

export function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [errorText, setErrorText] = useState('')

  const refresh = useCallback(async () => {
    const [items, openCount] = await Promise.all([
      db.todos.toArray(),
      db.todos.where('done').equals(0).count(),
    ])
    setTodos(items)
    document.title = `${openCount} open · doxor.js React example`
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(action: () => Promise<unknown>) {
    setErrorText('')
    try {
      await action()
      await refresh()
    } catch (error) {
      setErrorText(
        error instanceof DoxorError ? `${error.code}: ${error.message}` : String(error),
      )
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle('')
    // Booleans are not valid IndexedDB keys, so the indexed `done` flag is stored as 0 or 1.
    void run(() => db.todos.insert({ title: trimmed, done: 0 }))
  }

  return (
    <main>
      <h1>doxor.js todos</h1>
      <form onSubmit={handleSubmit}>
        <input
          name="title"
          placeholder="What needs doing?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.done === 1}
                onChange={(event) =>
                  void run(() =>
                    db.todos.update(todo.id, { done: event.target.checked ? 1 : 0 }),
                  )
                }
              />{' '}
              {todo.title}
            </label>
          </li>
        ))}
      </ul>
      {errorText ? <p style={{ color: '#b3261e' }}>{errorText}</p> : null}
    </main>
  )
}
