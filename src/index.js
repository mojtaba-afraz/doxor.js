export default class Doxor {
    constructor(name) {
        this.name = name
    }

    #DatabaseBridge(callback, type = 'store') {
        let request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = event => {
            if (type === 'store') callback(request.result)
        }
        request.onsuccess = event => {
            if (type !== 'store') {
                callback(request.result)
            }
        }
    }

    #GetObjectStore(DB, name, access = "readwrite") {
        return DB.transaction(name, access).objectStore(name)
    }

    Store(object) {
        this.#DatabaseBridge(DB => {
            const objectStore = DB.createObjectStore(object.name, {keyPath: "id", autoIncrement: true});
            for (let counter = 0; counter < object.indexes.length; counter++) {
                objectStore.createIndex(object.indexes[counter].key, object.indexes[counter].key, {unique: object.indexes[counter].unique});
            }
        })
    }

    Insert(name, value) {
        this.#DatabaseBridge(DB => {
            const request = this.#GetObjectStore(DB, name).add(value);
        }, 'insert')
    }

    remove(name, id) {
        this.#DatabaseBridge(DB => {
            const request = this.#GetObjectStore(DB, name).delete(id)
        }, "remove")
    }

    async get(name, id, callback) {
        this.#DatabaseBridge(DB => {
            this.#GetObjectStore(DB, name, undefined).get(id).onsuccess = event => callback(event.target.result)
        }, 'get')

    }

    getAll(name, callback) {
        this.#DatabaseBridge(DB => {
            const request = this.#GetObjectStore(DB, name).getAll().onsuccess = event => callback(event.target.result)
        }, 'getAll')
    }
}
