# doxor.js React example

A tiny todo list using doxor.js with Vite and React.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/mojtaba-afraz/doxor.js/tree/main/examples/react)

```sh
npm install
npm run dev
```

`src/db.ts` declares a single module-level `db` instance shared across components, and `src/App.tsx` loads records in an effect and refreshes state after each write.
