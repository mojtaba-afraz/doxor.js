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
}
