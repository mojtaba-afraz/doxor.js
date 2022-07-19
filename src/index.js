export default class Doxor {
    constructor(name) {
        this.name = name;
        this.version = 1;
        let request = indexedDB.open(name)
        request.onsuccess = (event) => {
            this.name = event.target.result.name;
            this.version = event.target.result.version;
        }
        request.onerror = (error) => {
            console.error(error);
        }
    }
    
    #DatabaseBridge(callback, type = 'store') {
        (type === 'store') ? this.version += 1 : undefined;
        let request = indexedDB.open(this.name, this.version);
        request.onupgradeneeded = () => {
            if (type === 'store') callback(request.result)
        }
        request.onsuccess = () => {
            if (type !== 'store') {
                callback(request.result)
            }
            request.result.close()
        }
    }

    static #GetObjectStore(DB, name, access = "readwrite") {
        return DB.transaction(name, access).objectStore(name)
    }

    store(object) {
        this.#DatabaseBridge(DB => {
            const objectStore = DB.createObjectStore(object.name, { keyPath: "id", autoIncrement: true });
            for (let counter = 0; counter < object.indexes.length; counter++) {
                objectStore.createIndex(object.indexes[counter].key, object.indexes[counter].key, { unique: object.indexes[counter].unique });
            }
        })
    }

    createCollection(name) {
        this.#DatabaseBridge(DB => {
            DB.createObjectStore(name, { keyPath: "id", autoIncrement: true });
        })
    }

    insert(name, value) {
        this.#DatabaseBridge(DB => {
            const request = Doxor.#GetObjectStore(DB, name).add(value);
        }, 'insert')
    }

    remove(name, id) {
        this.#DatabaseBridge(DB => {
            const request = Doxor.#GetObjectStore(DB, name).delete(id)
        }, "remove")
    }

    async get(name, id, callback) {
        this.#DatabaseBridge(DB => {
            Doxor.#GetObjectStore(DB, name, undefined).get(id).onsuccess = event => callback(event.target.result)
        }, 'get')
    }

    getAll(name, callback) {
        this.#DatabaseBridge(DB => {
            const request = Doxor.#GetObjectStore(DB, name).getAll().onsuccess = event => callback(event.target.result)
        }, 'getAll')
    }
}
