import { AccessMode } from './models/AccessMode';
import { QueryType } from './models/QueryType';

export default class Doxor {
    public name: string;
    public version: number = 1;

    constructor(name: string) {
        this.name = name;
        let request = indexedDB.open(name);
        request.onsuccess = (event: any) => {
            this.name = event.target.result.name;
            this.version = event.target.result.version;
        }

        request.onerror = (error) => {
            console.error(error);
        }
    }

    #DatabaseBridge(callback, type = QueryType.store) {
        if (type === QueryType.store) {
            this.version += 1;
        }

        let request = indexedDB.open(this.name, this.version);

        request.onupgradeneeded = () => {
            if (type === QueryType.store) callback(request.result);
        }

        request.onsuccess = () => {
            if (type !== QueryType.store) {
                callback(request.result);
            }
            request.result.close();
        }
    }

    static #GetObjectStore(DB, name, access: (AccessMode | undefined) = AccessMode.readwrite): any {
        return DB.transaction(name, access).objectStore(name);
    }

    store(object: any): void {
        const callback = (DB: any) => {
            const objectStore = DB.createObjectStore(object.name, { keyPath: "id", autoIncrement: true });
            for (let counter = 0; counter < object.indexes.length; counter++) {
                objectStore.createIndex(object.indexes[counter].key, object.indexes[counter].key, { unique: object.indexes[counter].unique });
            }
        };
        this.#DatabaseBridge(callback);
    }

    createCollection(name: string): void {
        this.#DatabaseBridge((DB: any) => {
            DB.createObjectStore(name, { keyPath: "id", autoIncrement: true });
        })
    }

    insert(name: string, value): void {
        const callback = (DB: any) => {
            const request = Doxor.#GetObjectStore(DB, name).add(value);
        };
        this.#DatabaseBridge(callback, QueryType.insert);
    }

    remove(name: string, id: string): void {
        const callback = (DB: any) => {
            const request = Doxor.#GetObjectStore(DB, name).delete(id)
        };
        this.#DatabaseBridge(callback, QueryType.remove)
    }

    async get(name: string, id, callback): Promise<any> {
        await this.#DatabaseBridge((DB: any) => {
            Doxor.#GetObjectStore(DB, name, undefined).get(id).onsuccess = event => callback(event.target.result)
        }, QueryType.get);
    }

    getAll(name: string, callback) {
        this.#DatabaseBridge(DB => {
            const request = Doxor.#GetObjectStore(DB, name).getAll().onsuccess = event => callback(event.target.result)
        }, QueryType.getAll)
    }
}
