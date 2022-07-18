var m = (o, e, t) => {
  if (!e.has(o))
    throw TypeError("Cannot " + t);
};
var h = (o, e, t) => {
  if (e.has(o))
    throw TypeError("Cannot add the same private member more than once");
  e instanceof WeakSet ? e.add(o) : e.set(o, t);
};
var n = (o, e, t) => (m(o, e, "access private method"), t);
var i, u, a, c;
const d = class {
  constructor(e) {
    h(this, i);
    this.name = e, this.version = 1;
    let t = indexedDB.open(e);
    t.onsuccess = (s) => {
      this.name = s.target.result.name, this.version = s.target.result.version;
    }, t.onerror = (s) => {
      console.error(s);
    };
  }
  Store(e) {
    n(this, i, u).call(this, (t) => {
      const s = t.createObjectStore(e.name, { keyPath: "id", autoIncrement: !0 });
      for (let r = 0; r < e.indexes.length; r++)
        s.createIndex(e.indexes[r].key, e.indexes[r].key, { unique: e.indexes[r].unique });
    });
  }
  CreateCollection(e) {
    n(this, i, u).call(this, (t) => {
      t.createObjectStore(e, { keyPath: "id", autoIncrement: !0 });
    });
  }
  Insert(e, t) {
    n(this, i, u).call(this, (s) => {
      var r;
      n(r = d, a, c).call(r, s, e).add(t);
    }, "insert");
  }
  remove(e, t) {
    n(this, i, u).call(this, (s) => {
      var r;
      n(r = d, a, c).call(r, s, e).delete(t);
    }, "remove");
  }
  async get(e, t, s) {
    n(this, i, u).call(this, (r) => {
      var l;
      n(l = d, a, c).call(l, r, e, void 0).get(t).onsuccess = (v) => s(v.target.result);
    }, "get");
  }
  getAll(e, t) {
    n(this, i, u).call(this, (s) => {
      var r;
      n(r = d, a, c).call(r, s, e).getAll().onsuccess = (l) => t(l.target.result);
    }, "getAll");
  }
};
let g = d;
i = new WeakSet(), u = function(e, t = "store") {
  t === "store" && (this.version += 1);
  let s = indexedDB.open(this.name, this.version);
  s.onupgradeneeded = (r) => {
    t === "store" && e(s.result);
  }, s.onsuccess = (r) => {
    t !== "store" && e(s.result), s.result.close();
  };
}, a = new WeakSet(), c = function(e, t, s = "readwrite") {
  return e.transaction(t, s).objectStore(t);
}, h(g, a);
export {
  g as default
};
