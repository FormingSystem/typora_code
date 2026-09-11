/*! Typora Code workspace core, derived from Typora Community Plugin 2.10.15.
MIT License

Copyright (c) 2023 plylrnsdy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
(()=>{const key=Symbol.for('typora-code:workspace');if(window[key])return;let resolve_ready,reject_ready;const ready=new Promise((resolve,reject)=>{resolve_ready=resolve;reject_ready=reject});window[key]={ready};(async()=>{const started=Date.now();while(!window.File||!window.reqnode||!window._options||!window.editor||!window.$||!window.editor.writingArea?.isConnected||!document.querySelector('#sidebar-content')||!document.body||document.readyState==='loading'){if(Date.now()-started>15000)throw new Error('Typora Code host initialization timed out');await new Promise(resolve=>setTimeout(resolve,10));}for(const link of document.querySelectorAll('link[data-typora-code-style]')){while(!link.sheet){if(Date.now()-started>15000)throw new Error('Typora Code stylesheet failed: '+link.href);await new Promise(resolve=>setTimeout(resolve,10));}}
var workspace_core_module = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i = decorators.length - 1, decorator; i >= 0; i--)
      if (decorator = decorators[i])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result) __defProp(target, key, result);
    return result;
  };

  // vendor/workspace_core/src/runtime.ts
  var runtime_exports = {};
  __export(runtime_exports, {
    initialize: () => initialize
  });

  // vendor/workspace_core/src/path.ts
  var BrowserPath = class {
    sep = File.isWin ? "\\" : "/";
    isAbsolute(path2) {
      return path2.startsWith("/");
    }
    basename(filepath, suffix) {
      const segments = filepath.split(/[\\\/]+/);
      if (!segments[segments.length - 1]) segments.pop();
      const base = segments.pop() ?? "";
      return suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
    }
    extname(filepath) {
      const base = this.basename(filepath);
      if (!base) return "";
      const idx = base.lastIndexOf(".");
      if (idx <= 0) return "";
      return base.slice(idx);
    }
    dirname(filepath) {
      const segments = filepath.split(/[\\\/]+/);
      if (!segments[segments.length - 1]) segments.pop();
      const result = segments.slice(0, -1).join(this.sep);
      return result || this.sep;
    }
    join(...paths) {
      if (!paths.length) return ".";
      const segments = paths.map((path2) => path2.trim().replace(/[\\\/]+$/, "")).flatMap((path2) => path2.split(/[\\\/]+/));
      const res = [];
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if ("." === s) continue;
        if (".." === s) {
          res.pop();
          continue;
        }
        res.push(s);
      }
      return res.join(this.sep);
    }
    relative(from, to) {
      if (from === to) return "";
      const segments1 = from.trim().split(/[\\\/]+/).filter(Boolean);
      const segments2 = to.trim().split(/[\\\/]+/).filter(Boolean);
      let commonLength = 0;
      while (commonLength < segments1.length && commonLength < segments2.length && segments1[commonLength] === segments2[commonLength]) {
        commonLength++;
      }
      const res = [];
      for (let i = commonLength; i < segments1.length; i++) {
        res.push("..");
      }
      for (let i = commonLength; i < segments2.length; i++) {
        res.push(segments2[i]);
      }
      return res.join(this.sep);
    }
  };
  var path = File.isNode ? reqnode("path") : new BrowserPath();
  var path_default = path;

  // vendor/workspace_core/src/io/logger/logger.ts
  var LogLevel = {
    DEBUG: { method: "debug", tag: "DEBUG", bgColor: "dimgray" },
    INFO: { method: "info", tag: "INFO", bgColor: "steelblue" },
    WARN: { method: "warn", tag: "WARN", bgColor: "darkorange" },
    ERROR: { method: "error", tag: "ERROR", bgColor: "firebrick" }
  };
  function badge(message, bgColor) {
    return [
      `%c${message}%c `,
      `color:#fff; background:${bgColor}; padding: 2px 4px; border-radius: 4px;`,
      // reset styles
      "color:unset; background:unset; padding:unset; border-radius:unset;"
    ];
  }
  function badges(...messages) {
    const result = [""];
    for (const badge2 of messages) {
      if (!badge2) continue;
      result[0] += badge2[0];
      result.push(badge2[1], badge2[2]);
    }
    return result;
  }
  var Logger = class {
    constructor(scope) {
      this.scope = scope;
    }
    log(level, messages) {
      console[level.method](
        ...badges(
          badge("[Typora Code]", level.bgColor),
          !!this.scope ? badge(this.scope, "gray") : void 0
        ),
        ...messages
      );
    }
    debug(...messages) {
      this.log(LogLevel.DEBUG, messages);
    }
    info(...messages) {
      this.log(LogLevel.INFO, messages);
    }
    warn(...messages) {
      this.log(LogLevel.WARN, messages);
    }
    error(...messages) {
      this.log(LogLevel.ERROR, messages);
    }
  };

  // vendor/workspace_core/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    Component: () => Component,
    Events: () => Events,
    Notice: () => Notice,
    SidebarPanel: () => SidebarPanel,
    WorkspaceView: () => WorkspaceView
  });

  // vendor/workspace_core/src/common/component.ts
  var Component = class {
    _loaded = false;
    _disposables = [];
    _children = [];
    load() {
      if (this._loaded) {
        return;
      }
      this.onload();
      this._children.forEach((child) => child.load());
      this._loaded = true;
    }
    unload() {
      if (!this._loaded) {
        return;
      }
      this.onunload();
      this._disposables.forEach((dispose) => dispose());
      this._disposables = [];
      this._children.forEach((child) => child.unload());
      this._children = [];
      this._loaded = false;
    }
    onload() {
    }
    onunload() {
    }
    addChild(component) {
      this._children.push(component);
      if (this._loaded) {
        component.load();
      }
      return () => this.removeChild(component);
    }
    removeChild(component) {
      component.unload();
      this._children = this._children.filter((c) => c !== component);
    }
    register(disposable) {
      this._disposables.push(disposable);
    }
    unregister(disposable) {
      disposable?.();
      this._disposables = this._disposables.filter((d) => d !== disposable);
    }
    registerDomEvent(target, event, listener, options) {
      target.addEventListener(event, listener, options);
      this.register(() => target.removeEventListener(event, listener, options));
    }
    registerInterval(intervalId) {
      this.register(() => clearInterval(intervalId));
    }
  };

  // vendor/workspace_core/src/utils/schedule/debounce.ts
  function debounce(func, wait, immediate) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      if (immediate && !timeout) func.apply(this, args);
      timeout = setTimeout(() => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      }, wait);
    };
  }

  // vendor/workspace_core/src/utils/decorator/debounced.ts
  function debounced(delay) {
    return function(target, propertyKey, descriptor) {
      const originalMethod = descriptor.value;
      descriptor.value = debounce(originalMethod, delay);
    };
  }

  // vendor/workspace_core/src/utils/function/memorize.ts
  function memorize(fn) {
    const cache = {};
    return function(...args) {
      const key = JSON.stringify(args);
      if (cache[key]) {
        return cache[key];
      } else {
        const res = fn.apply(this, args);
        cache[key] = res;
        return res;
      }
    };
  }

  // vendor/workspace_core/src/utils/function/noop.ts
  function noop() {
  }

  // vendor/workspace_core/src/utils/schedule/throttle.ts
  function throttle(func, wait) {
    let timeout = null;
    return function(...args) {
      if (!timeout) {
        func.apply(this, args);
        timeout = setTimeout(() => {
          timeout = null;
        }, wait);
      }
    };
  }

  // vendor/workspace_core/src/utils/string/capitalize.ts
  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
  }

  // vendor/workspace_core/src/utils/string/is-markdown-url.ts
  function isMarkdownUrl(urlString) {
    if (!urlString) return false;
    urlString = /^\w+:\/{2}/.test(urlString) ? urlString : `file://${urlString}`;
    const url = new URL(urlString);
    const ext = path_default.extname(url.pathname);
    return !urlString.startsWith("http") && (!!ext || File.SupportedFiles.includes(ext));
  }

  // vendor/workspace_core/src/utils/string/markdown.ts
  var RE_FRONT_MATTER = /^---\n([\s\S]+?)\n---\n?/;
  var RE_HEADING = /^#{1,6}\s+(.+)$/m;
  function parseTitles(content, lineOffset = 0) {
    const results = [];
    const lines = content.split(/\r|\n|\r\n/g);
    for (let i = 0; i < lines.length; i++) {
      const match2 = lines[i].match(RE_HEADING);
      if (match2) {
        results.push({
          name: match2[1].trim(),
          lineText: lines[i].trim(),
          lineNumber: i + lineOffset + 1
          // convert to 1-based
        });
      }
    }
    return results;
  }
  function parseMarkdown(md) {
    let frontMatter = "";
    let contentStartLine = 0;
    const content = md.replace(RE_FRONT_MATTER, (match2, $1) => {
      frontMatter = $1;
      contentStartLine = (match2.match(/\n/g) || []).length;
      return "";
    });
    const startLine = frontMatter ? 1 : -1;
    return {
      frontMatter,
      get frontMatters() {
        return frontMatter ? frontMatter.split(/\n(?=\S)/) : [];
      },
      content,
      /** 0-based line index in the original file where YAML content begins (after `---\n`). -1 if no frontmatter. */
      startLine,
      /** 0-based line index in the original file where `content` text begins. */
      contentStartLine
    };
  }

  // vendor/workspace_core/src/utils/string/random-string.ts
  function randomString() {
    return Math.random().toString(36).slice(2, 8);
  }

  // vendor/workspace_core/src/utils/string/truncate.ts
  var DEFAULT_OPTS = {
    length: 30,
    omission: "..."
  };
  function truncate(string, options = DEFAULT_OPTS) {
    if (typeof options !== "object") {
      throw new TypeError("`truncate()`'s argument `options` must be an object.");
    }
    const opts = Object.assign({}, DEFAULT_OPTS, options);
    if (typeof opts.length !== "number") {
      throw new TypeError("`truncate()`'s argument `options.length` must be a number.");
    }
    if (string.length <= opts.length) {
      return string;
    }
    const omission = opts.omission.toString();
    if (opts.length <= omission.length) {
      return omission;
    }
    return string.slice(0, opts.length - omission.length) + omission;
  }

  // vendor/workspace_core/src/utils/string/yaml.ts
  var keyValRegex = /^\s*([^\s\[\{:]+)\s*:\s*(.*)$/;
  var quotedKeyRegex = /^\s*(\"([^"]+)\"|\'([^']+)\')\s*:\s*(.*)/;
  var commentRegex = /^\s*#/;
  function parseSimplifiedYAML(metaString) {
    if (!metaString || typeof metaString !== "string") return {};
    const allLines = metaString.split(/\r|\n|\r\n/g);
    const parsedData = processLines(allLines);
    if (typeof parsedData !== "object" || Array.isArray(parsedData) || parsedData === null) {
      return {};
    }
    delete parsedData[""];
    return parsedData;
  }
  function parseTagsWithPositionsFromYAML(metaString, startLine) {
    if (!metaString || typeof metaString !== "string") return [];
    const lines = metaString.split(/\r|\n|\r\n/g);
    const results = [];
    let tagsKeyIndex = null;
    let tagsKeyIndent = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (commentRegex.test(line)) continue;
      const match2 = keyValRegex.exec(line) || quotedKeyRegex.exec(line);
      if (match2 && (match2[1] === "tags" || match2[2] === "tags" || match2[3] === "tags")) {
        tagsKeyIndex = i;
        tagsKeyIndent = line.search(/\S/);
        break;
      }
    }
    if (tagsKeyIndex === null) return [];
    const keyLine = lines[tagsKeyIndex];
    const valuePart = keyValRegex.exec(keyLine)?.[2]?.trim() || quotedKeyRegex.exec(keyLine)?.[4]?.trim() || "";
    if (valuePart.startsWith("[")) {
      const inlineMatch = valuePart.match(/^\[(.*)\]/);
      if (inlineMatch) {
        const items = inlineMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
        for (const item of items) {
          results.push({
            name: stripQuotes(item),
            lineText: keyLine.trim(),
            lineNumber: tagsKeyIndex + startLine + 1
            // convert to 1-based
          });
        }
      }
      return results;
    }
    if (valuePart) {
      results.push({
        name: stripQuotes(valuePart),
        lineText: keyLine.trim(),
        lineNumber: tagsKeyIndex + startLine + 1
      });
      return results;
    }
    for (let i = tagsKeyIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "" || commentRegex.test(line)) continue;
      const actualIndent = line.search(/\S/);
      if (actualIndent < tagsKeyIndent) break;
      if (actualIndent === tagsKeyIndent && !/^[\s]*[-+]\s/.test(line)) break;
      const listMatch = /^[\s]*[-+]\s+(.*)/.exec(line);
      if (listMatch) {
        results.push({
          name: stripQuotes(listMatch[1].trim()),
          lineText: line.trim(),
          lineNumber: i + startLine + 1
          // convert to 1-based
        });
      }
    }
    return results;
  }
  function stripQuotes(value) {
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }
    return value;
  }
  function processLines(lines) {
    let currentKey = "";
    const resultObj = {};
    let insideQuoteMode = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (commentRegex.test(line)) continue;
      let match2;
      if (!insideQuoteMode && (match2 = /^\s+/.exec(line))) {
        const indent = match2[0];
        let blockSymbol = "";
        const prevRawValue = resultObj[currentKey] || "";
        const symbolMatch = /^\s*([\|\>])\s*$/.exec(prevRawValue);
        if (symbolMatch) {
          blockSymbol = symbolMatch[1];
        }
        const [blockLines, nextIndex] = collectIndentedBlock(lines, i, indent);
        i = nextIndex - 1;
        if (blockSymbol === "|") {
          resultObj[currentKey] = blockLines.join("\n");
        } else if (blockSymbol === ">") {
          resultObj[currentKey] = blockLines.map((l) => l.trim() ? l.trim() + " " : "\n").join("").trim();
        } else {
          resultObj[currentKey] = processLines(blockLines);
        }
      } else if (match2 = /^[-+]\s/.exec(line)) {
        insideQuoteMode = false;
        const listIndent = match2[0].replace(/^[-+]/, " ");
        const [listBlock, nextIndex] = collectIndentedBlock(lines, i + 1, listIndent);
        i = nextIndex - 1;
        resultObj[currentKey] = resultObj[currentKey] || [];
        if (Array.isArray(resultObj[currentKey])) {
          resultObj[currentKey].push(
            processLines([line.substring(listIndent.length), ...listBlock])
          );
        }
      } else if (match2 = quotedKeyRegex.exec(line)) {
        insideQuoteMode = false;
        currentKey = match2[2] || match2[3] || "";
        resultObj[currentKey] = match2[4].trim();
        const quoteStart = /^["']/.exec(resultObj[currentKey]);
        if (quoteStart && resultObj[currentKey][resultObj[currentKey].length - 1] !== quoteStart[0]) {
          insideQuoteMode = quoteStart[0];
        }
      } else if (match2 = keyValRegex.exec(line)) {
        insideQuoteMode = false;
        currentKey = match2[1];
        resultObj[currentKey] = match2[2].trim();
        const quoteStart = /^["']/.exec(resultObj[currentKey]);
        if (quoteStart && resultObj[currentKey][resultObj[currentKey].length - 1] !== quoteStart[0]) {
          insideQuoteMode = quoteStart[0];
        }
      } else {
        currentKey = currentKey || "";
        const trimmedLine = line.trim();
        if (resultObj[currentKey]) {
          resultObj[currentKey] += "\n" + trimmedLine;
        } else {
          resultObj[currentKey] = trimmedLine;
        }
        if (typeof insideQuoteMode === "string" && trimmedLine[trimmedLine.length - 1] === insideQuoteMode) {
          insideQuoteMode = false;
        }
      }
    }
    const keys = Object.keys(resultObj);
    if (keys.length === 1 && resultObj[""] !== void 0) {
      return resultObj[""];
    }
    keys.forEach((k) => {
      if (typeof resultObj[k] === "string") {
        resultObj[k] = parseValue(resultObj[k]);
      }
    });
    return resultObj;
  }
  function collectIndentedBlock(lines, startIndex, prefix) {
    const block = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (line.indexOf(prefix) !== 0 && line.trim().length !== 0) break;
      block.push(line.substring(prefix.length));
      i++;
    }
    return [block, i];
  }
  function parseValue(val) {
    let match2;
    if (match2 = val.match(/^\s*\[(.*)\]\s*$/)) {
      return match2[1].split(/\s*,\s*/).map(parseValue);
    }
    if (match2 = val.match(/^\s*\{(.*)\}\s*$/)) {
      const obj = {};
      match2[1].split(/\s*,\s*/).forEach((item) => {
        const parts = item.split(/\s*:\s*/);
        if (parts.length === 2) obj[parts[0]] = parts[1];
      });
      if (Object.keys(obj).length) return obj;
    }
    if (/^"/.exec(val)) {
      return val.replace(/^"/, "").replace(/"$/, "").replace(/\n\n/g, "\n").replace(/\\\n/g, "").replace(/\n/g, " ").replace(/\\n/g, "\n");
    }
    if (/^'/.exec(val)) {
      return val.replace(/^'/, "").replace(/'$/, "").replace(/\n\n/g, "\n").replace(/''/g, "'").replace(/\n/g, " ");
    }
    return val.trim();
  }

  // vendor/workspace_core/src/utils/html.ts
  function html(strings, ...values) {
    const htmlStr = strings.reduce((htmlStr2, str, i) => {
      return htmlStr2 + values[i - 1] + str;
    });
    return $(htmlStr).get(0);
  }
  function getElementPagePosition(element) {
    let left = 0;
    let top = 0;
    while (element) {
      left += element.offsetLeft;
      top += element.offsetTop;
      element = element.offsetParent;
    }
    return { left, top };
  }

  // vendor/workspace_core/src/utils/indexed-db.ts
  var Table = class {
    constructor(dbInst, name) {
      this.dbInst = dbInst;
      this.name = name;
    }
    /**
     * Internal helper to get a specific ObjectStore
     */
    async _getStore(mode = "readonly") {
      const db = await this.dbInst._getDb();
      const transaction = db.transaction(this.name, mode);
      return transaction.objectStore(this.name);
    }
    /**
     * Helper to convert IDBRequest to Promise
     */
    _promisify(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async _transaction(mode, callback) {
      const db = await this.dbInst._getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.name, mode);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        const store = transaction.objectStore(this.name);
        callback(store);
      });
    }
    /**
     * Add a new record
     */
    async add(data) {
      const store = await this._getStore("readwrite");
      return this._promisify(store.add(data));
    }
    /**
     * Add new records
     */
    async bulkAdd(data) {
      return this._transaction("readwrite", (store) => data.forEach((row) => store.add(row)));
    }
    /**
     * Update an existing record or add if it doesn't exist
     */
    async put(data) {
      const store = await this._getStore("readwrite");
      return this._promisify(store.put(data));
    }
    /**
     * Update existing records or add if it doesn't exist
     */
    async bulkPut(data) {
      return this._transaction("readwrite", (store) => data.forEach((row) => store.put(row)));
    }
    /**
     * Get a record by primary key
     */
    async get(id) {
      const store = await this._getStore("readonly");
      return this._promisify(store.get(id));
    }
    /**
     * Get all records from the table
     */
    async toArray() {
      const store = await this._getStore("readonly");
      return this._promisify(store.getAll());
    }
    /**
     * Delete a record by primary key
     */
    async delete(id) {
      const store = await this._getStore("readwrite");
      return this._promisify(store.delete(id));
    }
    /**
     * Basic filter implementation
     * Use index if available, otherwise fallback to manual filter
     */
    where(key) {
      return {
        equals: async (value) => {
          const store = await this._getStore("readonly");
          const useIndex = store.indexNames.contains(key);
          const request = useIndex ? store.index(key).getAll(value) : store.getAll();
          const results = await this._promisify(request);
          return useIndex ? results : results.filter((item) => item[key] === value);
        }
      };
    }
  };
  var MiniDexie = class {
    dbName;
    _db = null;
    _schema = {};
    _version = 1;
    constructor(dbName) {
      this.dbName = dbName;
    }
    /**
     * Define the database version
     */
    version(v) {
      this._version = v;
      return {
        /**
         * Define the table schemas
         * @example
         *   { friends: "++id, name, age" }
         *   { friends: "guid, name, age" }
         */
        stores: (schema) => {
          this._schema = schema;
          Object.keys(schema).forEach((tableName) => {
            this[tableName] = new Table(this, tableName);
          });
          return this;
        }
      };
    }
    /**
     * Open the database connection or return the existing one (Lazy Loading)
     */
    async _getDb() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this._version);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          for (const [tableName, schemaStr] of Object.entries(this._schema)) {
            const keys = schemaStr.split(",").map((s) => s.trim());
            const primaryKey = keys[0];
            if (!db.objectStoreNames.contains(tableName)) {
              const store = db.createObjectStore(tableName, {
                keyPath: primaryKey.replace("++", ""),
                // "++id" -> "id"
                autoIncrement: primaryKey.startsWith("++")
              });
              keys.slice(1).forEach((key) => {
                store.createIndex(key, key, { unique: false });
              });
            }
          }
        };
        request.onsuccess = () => {
          this._db = request.result;
          resolve(this._db);
        };
        request.onerror = () => reject(request.error);
      });
    }
  };

  // vendor/workspace_core/src/utils/store.ts
  var Store = class {
    _data = {};
    _listeners = {};
    constructor(data) {
      if (data) {
        this._data = Object.create(data);
      }
    }
    get(key) {
      if (typeof key !== "string" && !Array.isArray(key)) {
        throw new TypeError("`key` must be a string | string[].");
      }
      const parts = typeof key === "string" ? [key] : key;
      return _getPathValue(this._data, parts);
    }
    /**
     * @tips If the `value` does not change, it will not trigger an update.
     * @tips If the `value` is an **object type**, the same reference will not trigger an update.
     *       You can use a nested key (like `['a', 'b']`) to trigger an update.
     */
    set(key, value) {
      const isStringKey = typeof key === "string";
      if (!isStringKey && !Array.isArray(key)) {
        throw new TypeError("`key` must be a string | string[].");
      }
      if (this.get(key) === value) return;
      const parts = isStringKey ? [key] : key;
      _setPathValue(this._data, parts, value);
      this._emit(isStringKey ? key : parts, value);
    }
    _emit(key, value) {
      const keyPath = _normalizeToPathKey(key);
      for (const k of [keyPath, "*"]) {
        this._listeners[k]?.forEach((fn) => {
          try {
            fn(key, value);
          } catch (error) {
            console.error(`Store :${k.toString()}=${value} failed to call a listener.
`, error);
          }
        });
      }
    }
    addChangeListener(key, listener) {
      const keyPath = _normalizeToPathKey(key);
      if (!this._listeners[keyPath]) {
        this._listeners[keyPath] = [];
      }
      if (this._listeners[keyPath].includes(listener)) {
        return noop;
      }
      this._listeners[keyPath].push(listener);
      return () => this.removeChangeListener(key, listener);
    }
    /**
     * Alias of `addChangeListener()`
     */
    onChange = this.addChangeListener;
    removeChangeListener(key, listener) {
      const keyPath = _normalizeToPathKey(key);
      if (!this._listeners[keyPath]) return;
      this._listeners[keyPath] = this._listeners[keyPath].filter((fn) => fn !== listener);
    }
  };
  function _normalizeToPathKey(key) {
    if (key === "*") return "*";
    if (typeof key === "string") return key;
    return key.join("\u25AA");
  }
  function _getPathValue(obj, parts) {
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return void 0;
      current = current[part];
    }
    return current;
  }
  function _setPathValue(obj, parts, value) {
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] == null || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      } else if (!Object.prototype.hasOwnProperty.call(current, parts[i])) {
        current[parts[i]] = { ...current[parts[i]] };
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  // vendor/workspace_core/src/utils/uniqueId.ts
  var counter = {};
  function uniqueId(prefix = "") {
    if (!counter[prefix]) counter[prefix] = 0;
    return prefix + ++counter[prefix];
  }

  // vendor/workspace_core/src/utils/until.ts
  function until(condition) {
    return new Promise((resolve) => {
      const timer = setInterval(_try, 352);
      function _try() {
        const res = condition();
        if (!res) return;
        clearInterval(timer);
        resolve(res);
      }
    });
  }

  // vendor/workspace_core/src/common/constants.ts
  var globalRootDir = () => reqnode("path").join(_options.userDataPath, "typora_code");
  var globalConfigDir = () => reqnode("path").join(globalRootDir(), "settings");
  var coreDir = () => globalRootDir();
  var platform = () => globalThis.process?.platform || "win32";
  var isDebug = () => false;

  // vendor/workspace_core/src/common/service.ts
  var services = {};
  var loadedServices = {};
  var stacks = [];
  function registerService(id, factory) {
    services[id] = factory;
  }
  function useService(id, args) {
    if (false) {
      if (!services[id]) {
        throw Error(`[Service] "${id}" is not registered.`);
      }
      if (stacks.includes(id)) {
        throw Error(`[Service] Circular dependency detected: ${[...stacks, id].join(" \u2192 ")}`);
      }
      if (fixedServicesLoadingOrder.includes(id)) {
        const index = fixedServicesLoadingOrder.indexOf(id);
        if (index !== 0) {
          throw Error(`[Service] "${id}" should be loaded before: ${fixedServicesLoadingOrder.slice(0, index).join(" \u2192 ")}`);
        } else {
          fixedServicesLoadingOrder.shift();
        }
      }
    }
    stacks.push(id);
    if (isDebug() && !loadedServices[id]) {
      loadedServices[id] = true;
      console.log(`[Service] Loading "${stacks.join(" \u2192 ")}"...`);
    }
    let service = services[id](args);
    if (false) {
      service = wrapWithLoggingProxy(service, id, useService("logger", [id]), {
        args: true,
        entry: true,
        exit: true,
        errors: true,
        perf: false
      });
    }
    stacks.pop();
    return service;
  }

  // vendor/workspace_core/src/common/events.ts
  var scopedListeners = {};
  var Events = class {
    constructor(scope, logger = useService("logger", ["Events"])) {
      this.scope = scope;
      this.logger = logger;
      if (scope) {
        if (scopedListeners[scope]) {
          this._listeners = scopedListeners[scope];
        } else {
          scopedListeners[scope] = this._listeners;
        }
      }
    }
    _listeners = {};
    prependListener(event, listener) {
      let listeners = this._listeners[event] ?? (this._listeners[event] = []);
      listeners.unshift(listener);
      return () => this.off(event, listener);
    }
    on(event, listener) {
      let listeners = this._listeners[event] ?? (this._listeners[event] = []);
      listeners.push(listener);
      return () => this.off(event, listener);
    }
    once(event, listener) {
      const onceListener = ((...args) => {
        listener(...args);
        this.off(event, onceListener);
      });
      this.on(event, onceListener);
      return () => this.off(event, onceListener);
    }
    off(event, listener) {
      const listeners = this._listeners[event] ?? [];
      this._listeners[event] = listeners.filter((fn) => fn !== listener);
    }
    emit(event, ...args) {
      if (isDebug()) {
        this.logger.debug(`${this.scope} @${event}
`, ...args);
      }
      this._listeners[event]?.forEach((fn) => {
        try {
          fn(...args);
        } catch (error) {
          this.logger.error(`${this.scope} @${event}
`, error);
        }
      });
    }
    getEventNames() {
      return Object.keys(this._listeners);
    }
  };
  var StickyEvents = class extends Events {
    _stickyEvents = {};
    _lastArgs = {};
    prependListener(event, listener) {
      if (this._shouldEmitStickyEvent(event)) {
        this._invokeStickyListener(event, listener);
      }
      return super.prependListener(event, listener);
    }
    on(event, listener) {
      if (this._shouldEmitStickyEvent(event)) {
        this._invokeStickyListener(event, listener);
      }
      return super.on(event, listener);
    }
    once(event, listener) {
      if (this._shouldEmitStickyEvent(event)) {
        this._invokeStickyListener(event, listener);
        return noop;
      }
      return super.once(event, listener);
    }
    _shouldEmitStickyEvent(event) {
      return this._stickyEvents[event] && this._lastArgs[event] !== void 0;
    }
    _invokeStickyListener(event, listener) {
      const args = this._lastArgs[event];
      if (isDebug()) {
        this.logger.debug(`${this.scope} @${event} (Sticky)
`, ...args);
      }
      try {
        listener(...args);
      } catch (error) {
        this.logger.error(`${this.scope} @${event} (Sticky)
`, error);
      }
    }
    emit(event, ...args) {
      this._lastArgs[event] = args;
      super.emit(event, ...args);
    }
    setSticky(event) {
      this._stickyEvents[event] = true;
    }
  };
  var PublicEvents = class extends Events {
    constructor(scope) {
      super(scope);
    }
    emit(event, ...args) {
      return super.emit(event, ...args);
    }
  };

  // vendor/workspace_core/src/common/eventbus.ts
  var useEventBus = memorize(
    function(scope) {
      return new PublicEvents(scope);
    }
  );

  // vendor/workspace_core/src/ui/layout/workspace-view.ts
  var WorkspaceView = class extends Component {
    constructor(leaf) {
      super();
      this.leaf = leaf;
    }
    containerEl;
    icon = "fa-file-text-o";
    setIcon(icon) {
      setTimeout(() => {
        $(this.leaf.parent?.tabHeader.getTabById(this.leaf.state.path)).find(".typ-file-icon").removeClass(this.icon).addClass(icon);
        this.icon = icon;
      }, 100);
    }
    isOpen = false;
    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.setIcon(this.icon);
      this.load();
      this.onOpen();
      useEventBus("workspace-root").emit("leaf:open", this.leaf);
    }
    onOpen() {
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      useEventBus("workspace-root").emit("leaf:will-close", this.leaf);
      this.onClose();
      useEventBus("workspace-root").emit("leaf:close", this.leaf);
      this.unload();
    }
    onClose() {
    }
    getScroll() {
      return { scrollTop: this.leaf.containerEl.scrollTop };
    }
    applyScroll(state) {
      this.leaf.containerEl.scrollTop = state.scrollTop;
    }
  };

  // vendor/workspace_core/src/ui/common/view.ts
  var View = class {
    containerEl;
    then(callback) {
      callback(this.containerEl);
      return this;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/sidebar-panel.ts
  var SidebarPanel = class extends View {
    constructor(ribbon = useService("ribbon"), sidebar = useService("sidebar")) {
      super();
      this.ribbon = ribbon;
      this.sidebar = sidebar;
    }
    ribbonButton;
    show() {
      this.sidebar.container.addPanel(this);
      this.onshow();
    }
    onshow() {
    }
    hide() {
      this.sidebar.container.removePanel(this);
      this.onhide();
    }
    onhide() {
    }
    addRibbonButton(button) {
      this.ribbonButton = {
        ...button,
        // @ts-ignore
        onclick: () => this.sidebar.switch(this.constructor)
      };
    }
    /**
     * @deprecated compatible with old api (<=2.2.22)
     */
    load() {
      this.onload();
    }
    /**
     * Use `onshow` instead.
     * @deprecated compatible with old api (<=2.2.22)
     */
    onload() {
    }
    /**
     * @deprecated compatible with old api (<=2.2.22)
     */
    unload() {
      this.onunload();
    }
    /**
     * Use `onhide` instead.
     * @deprecated compatible with old api (<=2.2.22)
     */
    onunload() {
    }
  };
  var InternalSidebarPanel = class extends SidebarPanel {
    constructor() {
      super();
    }
    show() {
      this.onshow();
    }
    hide() {
      this.onhide();
    }
  };

  // vendor/workspace_core/src/ui/components/notice.ts
  var NoticeContainer = class extends Component {
    containerEl;
    notices = [];
    constructor() {
      super();
      until(() => useService("command-manager")).then((commands) => {
        const { t } = useService("i18n");
        this.register(
          commands.register({
            id: "core.notice:clear-all",
            title: t.notice.clearAll,
            scope: "global",
            callback: () => this.clearAll()
          })
        );
      });
    }
    /** @private */
    onload() {
      this.containerEl = html`<div class="typ-notice__container" style="display: none;"></div>`;
      document.body.append(this.containerEl);
    }
    /** @private */
    onunload() {
      this.containerEl.remove();
    }
    add(notice) {
      this.notices.push(notice);
    }
    remove(notice) {
      this.notices = this.notices.filter((item) => item !== notice);
    }
    clearAll() {
      [...this.notices].forEach((notice) => notice.close());
    }
    open() {
      this.containerEl.style.display = "block";
    }
    close() {
      if (this.containerEl.children.length > 0) return;
      this.containerEl.style.display = "none";
    }
  };
  var noticeContainer = new NoticeContainer();
  var Notice = class _Notice extends View {
    static info(message, duration) {
      return new _Notice(message, duration);
    }
    static success(message, duration) {
      return new _Notice(message, { type: "success", duration });
    }
    static warning(message, duration) {
      return new _Notice(message, { type: "warning", duration });
    }
    static error(message, duration) {
      return new _Notice(message, { type: "error", duration });
    }
    constructor(message, options) {
      super();
      const duration = (typeof options === "number" ? options : options?.duration) ?? 5e3;
      const type = options?.type ?? "info";
      this.containerEl = $(`<div class="typ-notice ${type}"></div>`).append(`<div class="typ-notice__content">${message}</div>`).append($('<div class="typ-notice__close"><i class="typ-icon typ-close"></i></div>').on("click", () => this.close())).get(0);
      this.show();
      duration > 0 && setTimeout(() => this.close(), duration);
    }
    /**
     * @deprecated Use `setMessage` instead.
     */
    set message(msg) {
      this.containerEl.innerText = msg;
    }
    setMessage(msg) {
      this.message = msg;
      return this;
    }
    /**
     * @deprecated Notices should always be closable.
     */
    setCloseable(closeable) {
      return this;
    }
    show() {
      if (!noticeContainer.containerEl) return;
      noticeContainer.containerEl.append(this.containerEl);
      noticeContainer.add(this);
      noticeContainer.open();
      requestAnimationFrame(() => this.containerEl.classList.add("show"));
    }
    close() {
      this.containerEl.remove();
      noticeContainer.remove(this);
      noticeContainer.close();
    }
  };

  // vendor/workspace_core/src/io/fs/file-adapter.ts
  var FileAdapter = class {
    /**
     * On macOS, it's very slow.
     */
    async listFiles(dirpath, options = {}) {
      const { recursive = false, signal } = options;
      signal?.throwIfAborted();
      const names = await this.list(dirpath);
      const files = [];
      for (const name of names) {
        signal?.throwIfAborted();
        const filePath = path_default.join(dirpath, name);
        const isDirectory = await this.isDirectory(filePath);
        if (isDirectory) {
          if (recursive) {
            const subFiles = await this.listFiles(filePath, options);
            files.push(...subFiles);
          }
        } else {
          files.push(filePath);
        }
      }
      return files;
    }
  };

  // vendor/workspace_core/src/io/fs/fs.node.ts
  var fs = reqnode?.("fs");
  var fsp = fs?.promises;
  var NodeFS = class extends FileAdapter {
    access(filepath) {
      return fsp.access(filepath);
    }
    exists(filepath) {
      return fsp.access(filepath).then(() => true).catch(() => false);
    }
    stat(filepath) {
      return fsp.stat(filepath);
    }
    isDirectory(filepath) {
      return fsp.stat(filepath).then((stat) => stat.isDirectory());
    }
    mkdir(dirpath) {
      return fsp.mkdir(dirpath, { recursive: true }).then(noop);
    }
    copy(src, dest) {
      return fsp.cp(src, dest, { recursive: true });
    }
    move(src, dest) {
      return fsp.rename(src, dest).catch(() => {
        const opts = { recursive: false };
        return fsp.stat(src).then((s) => {
          opts.recursive = s.isDirectory();
        }).then(() => fsp.cp(src, dest, opts)).then(() => fsp.rm(src, opts));
      });
    }
    list(dirpath) {
      return fsp.readdir(dirpath);
    }
    readText(filepath) {
      return fsp.readFile(filepath, "utf8");
    }
    readTextSync(filepath) {
      return fs.readFileSync(filepath, "utf8");
    }
    writeText(filepath, text) {
      return fsp.writeFile(filepath, text, "utf8");
    }
    appendText(filepath, text) {
      return fsp.appendFile(filepath, text, "utf8");
    }
    remove(filepath) {
      return fsp.rm(filepath, { recursive: true });
    }
    trash(filepath) {
      return JSBridge.invoke("shell.trashItem", filepath);
    }
  };

  // vendor/workspace_core/src/io/shell.ts
  var Shell = class {
    constructor() {
    }
    static run(cmd, opts = { cwd: File.getMountFolder() }) {
      return new Promise((resolve, reject) => {
        bridge.callHandler(
          "controller.runCommand",
          { ...opts, args: cmd },
          ([success, out, error, cmd2]) => {
            success ? resolve(out) : reject(new Error(error));
          }
        );
      });
    }
    static escape(text) {
      return "'" + text.replace(/'/g, "'\\''") + "'";
    }
  };

  // vendor/workspace_core/src/io/fs/fs.darwin.ts
  var MacFileStats = class {
    constructor(info) {
      this.info = info;
    }
    isDirectory() {
      return this.info.includes("FileType: Directory");
    }
    isFile() {
      return this.info.includes("FileType: Regular File");
    }
    get mtimeMs() {
      const [, modifyStr] = this.info.match(/Modify:\s+(.*)/) ?? [];
      if (!modifyStr) return void 0;
      const date = new Date(modifyStr);
      return date.getTime();
    }
  };
  var MacFS = class extends FileAdapter {
    access(filepath) {
      return Shell.run(`test -e '${filepath}'`);
    }
    exists(filepath) {
      return this.access(filepath).then(() => true).catch(() => false);
    }
    stat(filepath) {
      return Shell.run(`stat '${filepath}'`).then((out) => new MacFileStats(out));
    }
    isDirectory(filepath) {
      return new Promise((resolve) => bridge.callHandler("path.isDirectory", filepath, resolve));
    }
    mkdir(dirpath) {
      return Shell.run(`mkdir -p '${dirpath}'`);
    }
    copy(src, dest) {
      return Shell.run(`cp -r '${src}' '${dest}'`);
    }
    move(src, dest) {
      return Shell.run(`mv -f '${src}' '${dest}'`);
    }
    list(dirpath) {
      return Shell.run(`ls '${dirpath}'`).then((out) => out.trim().split("\n"));
    }
    readText(filepath) {
      return Promise.resolve(this.readTextSync(filepath));
    }
    readTextSync(filepath) {
      return bridge.callSync("path.readText", filepath);
    }
    writeText(filepath, text) {
      return Shell.run(`echo ${Shell.escape(text)} > '${filepath}'`);
    }
    appendText(filepath, text) {
      return Shell.run(`cat ${Shell.escape(text)} >> '${filepath}'`);
    }
    remove(filepath) {
      return Shell.run(`rm -r '${filepath}'`);
    }
    /**
     * If the file is not exists, it will show a dialog.
     */
    trash(filepath) {
      return new Promise((resolve) => {
        bridge.callHandler("library.trashItem", filepath, resolve);
      });
    }
  };

  // vendor/workspace_core/src/io/fs/filesystem.ts
  var filesystem = File.isNode ? new NodeFS() : new MacFS();
  var filesystem_default = filesystem;

  // node_modules/@plylrnsdy/decorate.js/index.js
  function decorate(object, method, wrapper) {
    const originalKey = Symbol.for(`${method}$original`);
    const decoratorsKey = Symbol.for(`${method}$decorators`);
    const original = object[originalKey] ?? object[method];
    if (!object[decoratorsKey]) {
      object[originalKey] = original;
      object[decoratorsKey] = [];
    }
    object[decoratorsKey].push(wrapper);
    wrap(object, method, original, object[decoratorsKey]);
    return () => {
      object[decoratorsKey] = object[decoratorsKey].filter((fn) => fn !== wrapper);
      wrap(object, method, original, object[decoratorsKey]);
    };
  }
  function wrap(object, method, original, wrappers) {
    object[method] = wrappers.reduce((res, wrapper) => wrapper(res.bind(object), res), original);
  }
  decorate.parameters = function(object, method, wrapper) {
    return decorate(object, method, (_, fn) => function(...args) {
      return fn.call(this, ...wrapper.call(this, args));
    });
  };
  decorate.returnValue = function(object, method, wrapper) {
    return decorate(object, method, (_, fn) => function(...args) {
      const res = fn.call(this, ...args);
      const wrapped = (ret) => wrapper.call(this, args, ret);
      return res instanceof Promise ? res.then(wrapped) : wrapped(res);
    });
  };
  decorate.beforeCall = function(object, method, listener) {
    return decorate.parameters(object, method, function(args) {
      return listener.call(this, args), args;
    });
  };
  decorate.afterCall = function(object, method, listener) {
    return decorate.returnValue(object, method, function(args, res) {
      return listener.call(this, args, res), res;
    });
  };

  // vendor/workspace_core/src/ui/components/pointer-drag.ts
  var session_key = Symbol.for("typora-code:pointer-drag");
  function cancel_pointer_drag(view, reason = "cancelled") {
    view[session_key]?.cancel(reason);
  }
  function create_preview(source) {
    const doc = source.ownerDocument, view = doc.defaultView;
    const clone = source.cloneNode(true);
    const originals = [source, ...source.querySelectorAll("*")];
    const copies = [clone, ...clone.querySelectorAll("*")];
    for (let index = 0; index < copies.length; index++) {
      const node = copies[index], original = originals[index], style = view.getComputedStyle(original);
      node.removeAttribute("id");
      node.removeAttribute("title");
      node.removeAttribute("tabindex");
      node.removeAttribute("draggable");
      node.setAttribute("aria-hidden", "true");
      for (const name of node.getAttributeNames()) if (name.startsWith("data-")) node.removeAttribute(name);
      for (const name of ["font", "color", "fill", "background-color", "border-color", "border-width", "border-style", "border-radius", "padding", "gap", "display", "align-items", "justify-content", "line-height", "white-space", "text-overflow", "overflow", "width", "height", "box-sizing", "flex", "min-width", "max-width"]) {
        node.style.setProperty(name, style.getPropertyValue(name));
      }
    }
    const box = source.getBoundingClientRect();
    let background = "var(--bg-color, white)";
    for (let node = source; node; node = node.parentElement) {
      const color = view.getComputedStyle(node).backgroundColor;
      if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
        background = color;
        break;
      }
    }
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", width: box.width + "px", height: box.height + "px", margin: "0", pointerEvents: "none", zIndex: "2147483646", backgroundColor: background, opacity: ".95", transition: "none", animation: "none", transform: "none", boxShadow: "0 2px 8px rgba(0,0,0,.2)" });
    clone.dataset.workspaceDragPreview = "true";
    doc.body.append(clone);
    return clone;
  }
  function start_pointer_drag(event, options) {
    if (event.button !== 0 || event.isPrimary === false || !options.source.isConnected) return;
    const source = options.source, doc = source.ownerDocument, view = doc.defaultView;
    cancel_pointer_drag(view, "replaced");
    const start_x = event.clientX, start_y = event.clientY, pointer_id = event.pointerId;
    const origin = source.getBoundingClientRect(), previous_cursor = doc.documentElement.style.cursor, previous_select = doc.documentElement.style.userSelect, previous_opacity = source.style.opacity;
    let started = false, ended = false, preview, drop_hint;
    const events = new AbortController();
    const observer = new MutationObserver(() => {
      if (!source.isConnected) cancel("source-removed");
    });
    const point = (input) => ({ event: input, client_x: input.clientX, client_y: input.clientY, screen_x: input.screenX, screen_y: input.screenY, delta_x: input.clientX - start_x, delta_y: input.clientY - start_y, target: doc.elementFromPoint(input.clientX, input.clientY) });
    const cleanup = () => {
      ended = true;
      events.abort();
      observer.disconnect();
      preview?.remove();
      source.removeAttribute("data-workspace-drag-source");
      if (started) {
        doc.documentElement.style.cursor = previous_cursor;
        doc.documentElement.style.userSelect = previous_select;
        source.style.opacity = previous_opacity;
      }
      if (source.hasPointerCapture?.(pointer_id)) source.releasePointerCapture(pointer_id);
      if (view[session_key] === session) delete view[session_key];
      options.on_end?.(started);
    };
    const suppress_click = (released) => {
      const suppression = new AbortController();
      const clear = () => suppression.abort();
      doc.addEventListener("click", (input) => {
        input.preventDefault();
        input.stopImmediatePropagation();
        clear();
      }, { capture: true, signal: suppression.signal });
      doc.addEventListener("pointerup", (input) => {
        if (input.pointerId === pointer_id) view.setTimeout(clear, 0);
      }, { capture: true, signal: suppression.signal });
      doc.addEventListener("pointerdown", clear, { capture: true, once: true, signal: suppression.signal });
      view.addEventListener("pagehide", clear, { once: true, signal: suppression.signal });
      if (released) view.setTimeout(clear, 0);
    };
    const cancel = (reason = "cancelled") => {
      if (ended) return;
      try {
        if (started) {
          suppress_click(false);
          options.on_cancel?.(reason);
        }
      } finally {
        cleanup();
      }
    };
    const session = { cancel, get started() {
      return started;
    }, set_drop_effect(effect) {
      if (!started || ended) return;
      doc.documentElement.style.cursor = effect === "none" ? "not-allowed" : options.cursor || "grabbing";
      if (preview) {
        preview.dataset.workspaceDropEffect = effect;
        if (effect === "detach" && !drop_hint) {
          drop_hint = doc.createElement("span");
          drop_hint.textContent = "\u79FB\u5230\u65B0\u7A97\u53E3";
          Object.assign(drop_hint.style, { position: "absolute", top: "100%", left: "0", padding: "3px 6px", font: "12px system-ui", whiteSpace: "nowrap", background: "var(--bg-color, white)", color: "var(--text-color, #333)", border: "1px solid var(--vscode-focusBorder, #0078d4)", borderRadius: "3px" });
          preview.append(drop_hint);
          preview.style.overflow = "visible";
        }
        if (drop_hint) drop_hint.hidden = effect !== "detach";
      }
    } };
    view[session_key] = session;
    const move = (input) => {
      if (ended || input.pointerId !== pointer_id) return;
      if (!source.isConnected) {
        cancel("source-removed");
        return;
      }
      if (!(input.buttons & 1)) {
        cancel("button-lost");
        return;
      }
      const state = point(input);
      if (!started) {
        if (Math.hypot(state.delta_x, state.delta_y) < (options.threshold ?? 6)) return;
        started = true;
        doc.documentElement.style.cursor = options.cursor || "grabbing";
        doc.documentElement.style.userSelect = "none";
        try {
          if (options.preview !== false) preview = create_preview(source);
          source.dataset.workspaceDragSource = "true";
          source.style.opacity = ".45";
          try {
            source.setPointerCapture(pointer_id);
          } catch {
          }
          observer.observe(doc.documentElement, { childList: true, subtree: true });
          options.on_start?.(state);
        } catch (error) {
          cancel("error");
          throw error;
        }
      }
      if (ended) return;
      input.preventDefault();
      input.stopPropagation();
      if (preview) preview.style.transform = `translate3d(${origin.left + state.delta_x}px,${origin.top + state.delta_y}px,0)`;
      try {
        options.on_move(state);
      } catch (error) {
        cancel("error");
        throw error;
      }
    };
    const up = (input) => {
      if (ended || input.pointerId !== pointer_id || input.button !== 0) return;
      if (started) {
        input.preventDefault();
        input.stopPropagation();
        suppress_click(true);
      }
      try {
        if (started && source.isConnected) options.on_drop(point(input));
        else if (started) options.on_cancel?.("source-removed");
      } finally {
        cleanup();
      }
    };
    doc.addEventListener("pointermove", move, { capture: true, signal: events.signal });
    doc.addEventListener("pointerup", up, { capture: true, signal: events.signal });
    doc.addEventListener("pointercancel", (input) => {
      if (input.pointerId === pointer_id) cancel("pointer-cancel");
    }, { capture: true, signal: events.signal });
    source.addEventListener("lostpointercapture", () => cancel("capture-lost"), { signal: events.signal });
    doc.addEventListener("keydown", (input) => {
      if (input.key === "Escape") {
        input.preventDefault();
        input.stopImmediatePropagation();
        cancel("escape");
      }
    }, { capture: true, signal: events.signal });
    doc.addEventListener("dragstart", (input) => {
      input.preventDefault();
      input.stopImmediatePropagation();
    }, { capture: true, signal: events.signal });
    view.addEventListener("blur", () => cancel("window-blur"), { signal: events.signal });
    view.addEventListener("pagehide", () => cancel("pagehide"), { signal: events.signal });
    event.preventDefault();
    event.stopPropagation();
    return session;
  }
  function create_drop_marker(doc) {
    const marker = doc.createElement("div");
    marker.dataset.workspaceDropMarker = "true";
    Object.assign(marker.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483645", background: "var(--vscode-focusBorder, var(--primary-color, #0078d4))" });
    const place = (rect) => {
      if (!marker.isConnected) doc.body.append(marker);
      Object.assign(marker.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px", display: "block" });
    };
    return { show(rect) {
      place(rect);
      Object.assign(marker.style, { background: "var(--vscode-focusBorder, var(--primary-color, #0078d4))", border: "none" });
    }, highlight(rect) {
      place(rect);
      Object.assign(marker.style, { boxSizing: "border-box", background: "color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent)", border: "1px solid var(--vscode-focusBorder, #0078d4)" });
    }, hide() {
      marker.style.display = "none";
    }, dispose() {
      marker.remove();
    } };
  }

  // vendor/workspace_core/src/ui/components/draggable.ts
  function draggable(container_el, direction, on_change) {
    const doc = container_el.ownerDocument, marker = create_drop_marker(doc);
    let session;
    const on_pointer_down = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(".typ-close,button,input,textarea,select,a")) return;
      const source = element?.closest("[draggable=true]");
      if (!source || !container_el.contains(source)) return;
      const parent = source.parentElement;
      let destination, before = true;
      const update = (state) => {
        marker.hide();
        destination = void 0;
        const target = state.target?.closest("[draggable=true]");
        if (!target || target === source || target.parentElement !== parent) return;
        destination = target;
        const box = target.getBoundingClientRect();
        before = direction === "x" ? state.client_x < box.left + box.width / 2 : state.client_y < box.top + box.height / 2;
        marker.show(direction === "x" ? { left: before ? box.left : box.right - 2, top: box.top, width: 2, height: box.height } : { left: box.left, top: before ? box.top : box.bottom - 2, width: box.width, height: 2 });
      };
      session = start_pointer_drag(event, {
        source,
        on_move: update,
        on_drop(state) {
          update(state);
          if (destination && source.parentElement === parent && destination.parentElement === parent) {
            destination.insertAdjacentElement(before ? "beforebegin" : "afterend", source);
            on_change?.();
          }
        },
        on_end() {
          marker.hide();
          session = void 0;
        }
      });
    };
    container_el.addEventListener("pointerdown", on_pointer_down);
    return () => {
      session?.cancel("dispose");
      marker.dispose();
      container_el.removeEventListener("pointerdown", on_pointer_down);
    };
  }

  // vendor/workspace_core/src/ui/components/menu.ts
  var Menu = class extends View {
    submenus = {};
    component = new Component();
    _mouseoverListeners = {};
    _mouseoutListeners = {};
    constructor() {
      super();
      this.containerEl = $(`<ul class="dropdown-menu context-menu" role="menu">`).on("click", () => this.close()).get(0);
      document.body.append(this.containerEl);
      this._registerEvent();
    }
    _registerEvent() {
      $(this.containerEl).on("mouseover", (event) => {
        const key = event.target.closest("[data-action]")?.getAttribute("data-key");
        Object.values(this.submenus).forEach((m) => m.close());
        if (!key) return;
        const listener = this._mouseoverListeners[key];
        if (listener) listener(event);
      });
    }
    /**
     * Remove all menu items.
     */
    empty() {
      this.containerEl.innerHTML = "";
      return this;
    }
    _createItem(build) {
      const item = new MenuItem(this);
      build(item);
      return item;
    }
    addItem(build) {
      this.containerEl.append(this._createItem(build).containerEl);
      return this;
    }
    _createSeparator() {
      return $('<li class="divider typ-menuitem" for-file="" for-folder=""></li>')[0];
    }
    addSeparator() {
      this.containerEl.append(this._createSeparator());
      return this;
    }
    /**
     * @private
     */
    _onMouseOver(key, callback) {
      this._mouseoverListeners[key] = callback;
    }
    showAtMouseEvent(event) {
      const y = event.clientY < window.innerHeight / 2 ? event.clientY : event.clientY - this.containerEl.children.length * 30 - 8;
      const pos = {
        x: event.clientX,
        y
      };
      this.showAtPosition(pos);
      return this;
    }
    showAtPosition(position) {
      this.containerEl.style.top = position.y + "px";
      this.containerEl.style.left = position.x + "px";
      this.open();
      return this;
    }
    /**
     * Show menu.
     *
     * Do not use it directly. Use `showAtMouseEvent()` or `showAtPosition()` instead.
     */
    open() {
      setTimeout(() => {
        this.containerEl.style.display = "block";
        this.component.registerDomEvent(document.body, "click", (event) => {
          if (event.target.closest(".context-menu")) return;
          this.close();
        });
      });
    }
    close() {
      this.containerEl.style.display = "none";
      this.component.unload();
      return this;
    }
  };
  var MenuItem = class {
    /**
     * Private constructor. Use {@link Menu.addItem} instead.
     */
    constructor(menu) {
      this.menu = menu;
      this.containerEl = html`<li data-action="" data-key="" class="typ-menuitem"></li>`;
      this.anchorEl = html`<a role="menuitem" data-localize="" data-lg="" class="state-off"></a>`;
      this.containerEl.append(this.anchorEl);
    }
    containerEl;
    anchorEl;
    iconEl;
    title;
    setKey(key) {
      this.containerEl.dataset.key = key;
      return this;
    }
    setTitle(title) {
      this.title = title;
      this._setContent();
      return this;
    }
    setIcon(icon) {
      if (typeof icon === "string") {
        this.iconEl = html`<i class="fa fa-${icon}"></i>`;
      } else {
        this.iconEl = icon;
      }
      this._setContent();
      return this;
    }
    _setContent() {
      this.anchorEl.innerText = this.title;
      this.iconEl && this.anchorEl.prepend(this.iconEl);
    }
    onClick(callback) {
      this.containerEl.addEventListener("click", callback);
      return this;
    }
    setSubmenu(build) {
      this.containerEl.classList.add("has-extra-menu");
      this.anchorEl.append($('<i class="fa fa-caret-right"></i>')[0]);
      const itemKey = this.containerEl.dataset.key;
      const submenuKey = itemKey + ":submenu";
      const submenu = this.menu.submenus[submenuKey] ??= new Menu();
      submenu.empty();
      build(submenu);
      this.menu._onMouseOver(itemKey, (event) => {
        const itemEl = this.menu.containerEl;
        const itemPos = getElementPagePosition(this.containerEl);
        const submenuPos = {
          x: itemPos.left + itemEl.offsetWidth + 6,
          y: itemPos.top
        };
        submenu.showAtPosition(submenuPos);
      });
      return this;
    }
  };
  var InternalContextMenu = class extends Menu {
    _mousedownListeners = {};
    constructor(selector) {
      super();
      this.containerEl.remove();
      this.containerEl = $(selector)[0];
      this._registerEvent();
      $(this.containerEl).on("mousedown", "[data-action]", (event) => {
        const key = event.target.closest("[data-action]").getAttribute("data-key");
        const listener = this._mousedownListeners[key];
        if (listener) listener(event);
      });
    }
    removeExtendedMenuItem() {
      $(this.containerEl).find(".typ-menuitem").remove();
      return this;
    }
    _createItem(build) {
      const item = new InternalMenuItem(this);
      build(item);
      return item;
    }
    /**
     * @example
     * app.workspace.on('file-menu', ({ menu }) => {
     *   menu.insertItemAfter('[data-action="open"]', item => {...})
     * })
     */
    insertItemAfter(selector, build) {
      const prevItem = this.containerEl.querySelector(selector);
      if (!prevItem) {
        throw Error(`No element matched selector '${selector}'.`);
      }
      prevItem.insertAdjacentElement("afterend", this._createItem(build).containerEl);
      return this;
    }
    insertSeparatorAfter(selector) {
      this.containerEl.querySelector(selector).insertAdjacentElement("afterend", this._createSeparator());
      return this;
    }
    _onMouseDown(key, callback) {
      this._mousedownListeners[key] = callback;
    }
  };
  var InternalMenuItem = class extends MenuItem {
    constructor(menu) {
      super(menu);
    }
    onClick(callback) {
      const menu = this.menu;
      menu._onMouseDown(this.containerEl.dataset.key, callback);
      return this;
    }
  };

  // vendor/workspace_core/src/ui/ribbon/workspace-ribbon.ts
  var DEFAULT_RIBBON_SETTINGS = {
    ribbonState: {}
  };
  var BUILT_IN = Symbol("built-in");
  var WorkspaceRibbon = class extends Component {
    constructor(config = useService("config-repository"), settings = useService("settings"), i18n = useService("i18n"), commands = useService("command-manager")) {
      super();
      this.config = config;
      this.settings = settings;
      this.i18n = i18n;
      this.commands = commands;
      settings.setDefault(DEFAULT_RIBBON_SETTINGS);
      settings.onChange("showRibbon", (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    ribbonView;
    buttons = [];
    get ribbonWidth() {
      const root = document.body;
      return +getComputedStyle(root).getPropertyValue("--typ-ribbon-width").trim().slice(0, -2);
    }
    load() {
      if (!this.settings.get("showRibbon")) {
        return;
      }
      super.load();
    }
    onload() {
      this.register(
        decorate.parameters(
          editor.library,
          "setSidebarWidth",
          ([width, saveInSettings]) => [width - (saveInSettings ? this.ribbonWidth : 0), saveInSettings]
        )
      );
      this.ribbonView = new RibbonView({
        buttons: this.buttons,
        onChange: (buttons) => {
          this.settings.set("ribbonState", this.getState());
        }
      });
      document.body.classList.add("typ-ribbon--enable");
      document.querySelector("#typora-sidebar-resizer").insertAdjacentElement("afterend", this.ribbonView.containerEl);
    }
    onunload() {
      document.body.classList.remove("typ-ribbon--enable");
      this.ribbonView.containerEl.remove();
    }
    addButton(button) {
      if (this.buttons.find((btn) => btn.id === button.id)) {
        throw Error("[WorkspaceRibbon] Button's id duplicated!");
      }
      const state = this.settings.get("ribbonState")[button.id];
      if (state) {
        button.visible = state.visible;
        button.order = state.order;
      }
      if (!("visible" in button)) {
        button.visible = true;
      }
      if (!("order" in button)) {
        button.order = this.buttons.length - 1;
      }
      this.buttons.push(button);
      this.ribbonView?.renderButton(button);
      return () => this.removeButton(button);
    }
    removeButton(button) {
      this.ribbonView?.removeButton(button);
      this.buttons = this.buttons.filter((btn) => btn !== button);
    }
    activeButton(id) {
      this.ribbonView?.activeButton(id);
    }
    clickButton(id) {
      this.ribbonView?.clickButton(id);
    }
    getState() {
      return this.buttons.filter((btn) => btn.group !== "bottom").reduce((o, btn, i) => (o[btn.id] = {
        visible: btn.visible,
        order: btn.order ?? i
      }, o), {});
    }
  };
  var RibbonView = class extends View {
    constructor(props) {
      super();
      this.props = props;
      this.containerEl = html`<div class="typ-ribbon">`;
      this.containerEl.append(
        this.groupTop = html`<div class="group top"></div>`,
        this.groupBottom = html`<div class="group bottom"></div>`
      );
      this.props.buttons.sort((a, b) => a.order - b.order).forEach((btn) => this.renderButton(btn));
      draggable(this.groupTop, "y", () => {
        const el = this.groupTop;
        Array.from(el.children).forEach((icon, i) => {
          const btn = this.props.buttons.find((btn2) => btn2.id === icon.dataset.id);
          btn.order = i;
        });
        this.props.onChange?.(this.props.buttons);
      });
      this.dispalyMenu = new Menu();
      $(this.groupTop).on("contextmenu", (event) => {
        this.dispalyMenu.empty();
        this.props.buttons.filter((btn) => btn.group !== "bottom").forEach((btn) => {
          this.dispalyMenu.addItem((item) => {
            item.setKey(btn.id).setIcon(btn.icon.cloneNode(true)).setTitle(btn.title).onClick(() => this.toggleButton(btn));
          });
        });
        this.dispalyMenu.showAtMouseEvent(event.originalEvent);
      });
    }
    dispalyMenu;
    groupTop;
    groupBottom;
    renderButton(button) {
      if (!("group" in button)) {
        button.group = "top";
      }
      const itemEl = document.createElement("div");
      itemEl.title = button.title ?? "";
      itemEl.dataset.id = button.id;
      itemEl.setAttribute("draggable", "true");
      itemEl.style.display = button.visible ? "flex" : "none";
      itemEl.classList.add("typ-ribbon-item");
      if (button.className) {
        itemEl.classList.add(button.className);
      }
      if (!button[BUILT_IN]) {
        itemEl.addEventListener("click", () => {
          $("#typora-sidebar").removeClass("active-tab-files").removeClass("ty-show-search").removeClass("active-tab-outline");
        });
      }
      if (button.onclick) {
        itemEl.addEventListener(
          "click",
          button.group === "top" ? (e) => {
            this.activeButton(button.id);
            button.onclick?.(e);
          } : button.onclick
        );
      }
      itemEl.append(button.icon);
      this.containerEl.querySelector(`.group.${button.group}`).append(itemEl);
    }
    removeButton(button) {
      const el = this.containerEl.querySelector(`.typ-ribbon-item[data-id="${button.id}"]`);
      el.remove();
    }
    toggleButton(button) {
      button.visible = !button.visible;
      button.visible ? this.showButton(button) : this.hideButton(button);
      this.props.onChange?.(this.props.buttons);
    }
    showButton(button) {
      const el = this.containerEl.querySelector(`.typ-ribbon-item[data-id="${button.id}"]`);
      el.style.display = "flex";
    }
    hideButton(button) {
      const el = this.containerEl.querySelector(`.typ-ribbon-item[data-id="${button.id}"]`);
      el.style.display = "none";
    }
    activeButton(id) {
      $(".typ-ribbon-item", this.containerEl).removeClass("active");
      $(`.typ-ribbon-item[data-id="${id}"]`, this.containerEl).addClass("active");
    }
    clickButton(id) {
      $(`.typ-ribbon-item[data-id="${id}"]`, this.containerEl).get(0).click();
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/search-result-renderer.ts
  var SELECTOR_RESULTS = "#file-library-search-result";
  var PATH_SEP = " / ";
  var BATCH_SIZE = 20;
  var SearchResultRenderer = class {
    /** Cached parsed template DOM node, initialized once on first use */
    _templateDom = null;
    /** Map: normalized file path → DOM element (O(1) dedup, no querySelector) */
    _pathElMap = /* @__PURE__ */ new Map();
    /** Render queue for rAF-batched DOM insertion */
    _queue = [];
    /** Current rAF id, null when idle */
    _rafId = null;
    /** Called when the render queue has fully drained */
    _onDrain = null;
    // ── Public API ────────────────────────────────────────────────────────
    /**
     * Enqueue a search result for batched rendering.
     * Results are inserted into the DOM in batches via requestAnimationFrame,
     * yielding to the UI thread between batches.
     */
    renderResult(result, resultsEl) {
      if (!result.filePath || !result.filePath.trim()) return;
      this._queue.push({
        result,
        resultsEl: resultsEl ?? document.querySelector(SELECTOR_RESULTS)
      });
      this._scheduleFlush();
    }
    /** Clear all search results from the DOM. */
    clearResults(resultsEl = document.querySelector(SELECTOR_RESULTS)) {
      this._cancelFlush();
      this._queue.length = 0;
      this._pathElMap.clear();
      resultsEl.innerHTML = "";
    }
    /**
     * Register a callback that fires when all queued results have been rendered.
     * If the queue is already empty, the callback fires immediately.
     */
    onDrain(callback) {
      if (this._queue.length === 0 && this._rafId === null) {
        callback();
      } else {
        this._onDrain = callback;
      }
    }
    // ── Batch scheduling ─────────────────────────────────────────────────
    _scheduleFlush() {
      if (this._rafId !== null) return;
      this._rafId = requestAnimationFrame(() => this._flushBatch());
    }
    _cancelFlush() {
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }
    _flushBatch() {
      this._rafId = null;
      const batch = this._queue.splice(0, BATCH_SIZE);
      for (const { result, resultsEl } of batch) {
        this._renderOne(result, resultsEl);
      }
      if (this._queue.length > 0) {
        this._scheduleFlush();
      } else {
        const cb = this._onDrain;
        this._onDrain = null;
        cb?.();
      }
    }
    // ── Core rendering ──────────────────────────────────────────────────
    /** Render a single result (called from batch flush). */
    _renderOne(result, resultsEl) {
      const normalizedPath = result.filePath.split(/[\\/]/).join(path_default.sep);
      const existingItem = this._pathElMap.get(normalizedPath);
      if (result.matches.length === 0) {
        if (!existingItem) {
          this._appendFileItem(resultsEl, result);
        }
        return;
      }
      if (existingItem) {
        for (const match2 of result.matches) {
          if (match2.source?.startsWith("field:")) continue;
          const matchesContainer = existingItem.querySelector(".ty-search-item-matches");
          if (matchesContainer) {
            this._appendLineToContainer(matchesContainer, existingItem, match2);
          }
        }
      } else {
        this._appendFileItem(resultsEl, result);
      }
    }
    // ── Private helpers ───────────────────────────────────────────────────
    /** Append a file result item to the results list. */
    _appendFileItem(resultsEl, result) {
      const mountPath = useService("vault").path;
      const relPath = result.filePath.startsWith(mountPath) ? result.filePath.slice(mountPath.length).replace(/^[/\\]/, "") : result.filePath;
      const normalized = relPath.replace(/\\/g, "/");
      const lastSlash = normalized.endsWith("/") ? normalized.lastIndexOf("/", normalized.length - 2) : normalized.lastIndexOf("/");
      const fileName = normalized.substring(lastSlash + 1) || normalized;
      const dotIdx = fileName.indexOf(".");
      const displayName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
      const extension = dotIdx > 0 ? fileName.substring(dotIdx) : "";
      const parentFolder = lastSlash > 0 ? normalized.substring(0, lastSlash) : "";
      const itemEl = this._getTemplateDom()?.cloneNode(true);
      if (!itemEl) return;
      itemEl.dataset.path = result.filePath.split(/[\\/]/).join(path_default.sep);
      this._pathElMap.set(itemEl.dataset.path, itemEl);
      const namePartEl = itemEl.querySelector(".file-list-item-file-name-part");
      if (namePartEl) {
        this._highlightMatch(namePartEl, displayName, result.matches[0]?.matchedText ?? "");
      }
      const extPartEl = itemEl.querySelector(".file-list-item-file-ext-part");
      if (extPartEl) {
        extPartEl.textContent = extension;
      }
      const locEl = itemEl.querySelector(".file-list-item-parent-loc");
      if (locEl && parentFolder) {
        locEl.textContent = parentFolder.split("/").join(PATH_SEP);
      }
      const visibleMatches = result.matches.filter((m) => m.source !== "field:filename");
      const countEl = itemEl.querySelector(".file-list-item-count");
      if (countEl) {
        countEl.textContent = visibleMatches.length > 0 ? String(visibleMatches.length) : "";
      }
      resultsEl.appendChild(itemEl);
      if (visibleMatches.length > 3) {
        itemEl.classList.add("ty-search-item-expand");
      }
      const matchesContainer = itemEl.querySelector(".ty-search-item-matches");
      for (const match2 of result.matches) {
        if (match2.source === "field:filename") continue;
        this._appendLineToContainer(matchesContainer, itemEl, match2);
      }
    }
    _appendLineToContainer(container, itemEl, match2) {
      const lineEl = document.createElement("div");
      lineEl.className = "ty-search-item-line";
      lineEl.dataset.line = String(match2.lineNumber);
      lineEl.dataset.lineText = match2.lineText;
      if (match2.matchedText) {
        lineEl.dataset.match = match2.matchedText;
      }
      this._renderLineText(lineEl, match2.lineText, match2.matchedText);
      container.appendChild(lineEl);
      const countEl = itemEl.querySelector(".file-list-item-count");
      if (countEl) {
        const currentCount = parseInt(countEl.textContent ?? "0", 10);
        countEl.textContent = String(currentCount + 1);
      }
      const totalLines = container.querySelectorAll(".ty-search-item-line").length;
      if (totalLines > 3 && !itemEl.classList.contains("ty-search-item-expand")) {
        itemEl.classList.add("ty-search-item-expand");
      }
    }
    /** Append highlighted text to container: before + mark(span) + after. */
    _appendHighlightedText(container, fullText, matchStart, matchLength) {
      if (matchStart > 0) {
        container.appendChild(document.createTextNode(fullText.substring(0, matchStart)));
      }
      const markEl = document.createElement("span");
      markEl.className = "ty-file-search-match-text";
      markEl.textContent = fullText.substring(matchStart, matchStart + matchLength);
      container.appendChild(markEl);
      const afterText = fullText.substring(matchStart + matchLength);
      if (afterText) {
        container.appendChild(document.createTextNode(afterText));
      }
    }
    /** Highlight a match within file name text. */
    _highlightMatch(container, fileName, matchText) {
      if (!matchText || !fileName) {
        container.textContent = fileName;
        return;
      }
      const lowerFull = fileName.toLowerCase();
      const lowerMatch = matchText.toLowerCase();
      const idx = lowerFull.indexOf(lowerMatch);
      if (idx < 0) {
        container.textContent = fileName;
        return;
      }
      this._appendHighlightedText(container, fileName, idx, matchText.length);
    }
    /** Render a line of text with the matched portion highlighted. */
    _renderLineText(container, lineText, matchText) {
      if (!matchText || !lineText) {
        container.appendChild(document.createTextNode(lineText));
        return;
      }
      const idx = lineText.indexOf(matchText);
      if (idx < 0) {
        container.appendChild(document.createTextNode(lineText));
        return;
      }
      this._appendHighlightedText(container, lineText, idx, matchText.length);
    }
    /**
     * Get the parsed template DOM node, cached after first call.
     *
     * Reads from `<script id="file-search-item-template" type="text/x-template">`
     * (or a native `<template>` element), parses innerHTML into real DOM nodes,
     * and caches the result so subsequent calls use `cloneNode()` only.
     */
    _getTemplateDom() {
      if (this._templateDom) return this._templateDom;
      const raw = document.getElementById("file-search-item-template");
      if (!raw) {
        console.warn("[SearchResultRenderer] file-search-item-template not found in DOM");
        return null;
      }
      if (raw.tagName === "TEMPLATE" && raw.content) {
        this._templateDom = raw.content.querySelector(".ty-search-item");
      } else {
        const container = document.createElement("div");
        container.innerHTML = raw.innerHTML.trim();
        this._templateDom = container.firstElementChild;
      }
      return this._templateDom;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/views/global-search-progressbar.ts
  var GlobalSearchProgressbar = class extends Component {
    el;
    constructor() {
      super();
      decorate.afterCall(editor.library.fileSearch, "onSearchUpdate", ([s], results) => {
        this.show();
        if (s === "" && editor.library.fileSearch.endCount === 0) {
          this.hide();
        }
      });
    }
    onload() {
      this.el = html`
      <div class="typ-global-search-progressbar" style="display: none;">
        <div class="typ-global-search-progressbar-inner"></div>
      </div>
    `;
      const inputEl = document.querySelector("#file-library-search-input");
      if (!inputEl) return;
      const resultsEl = document.getElementById("file-library-search-result");
      if (resultsEl) {
        resultsEl.parentNode?.insertBefore(this.el, resultsEl);
      } else {
        inputEl.parentNode?.appendChild(this.el);
      }
    }
    onunload() {
      this.el.remove();
    }
    show() {
      this.el.style.display = "block";
    }
    hide() {
      this.el.style.display = "none";
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/views/advanced-search-mode.ts
  var AdvancedSearchMode = class extends Component {
    constructor(i18n = useService("i18n"), settings = useService("settings")) {
      super();
      this.i18n = i18n;
      this.load();
      settings.onChange(this.SETTING_KEY, () => {
        this._updateButtonState();
      });
    }
    SETTING_KEY = "advancedSearchMode";
    headerRow;
    labelEl;
    btnEl;
    onload() {
      const _globalSearch = useService("app").features.globalSearch;
      this._injectButton();
      this.register(
        decorate(editor.library.fileSearch, "search", (fn) => (query) => {
          if (!this._isEnabled()) return fn(query);
          _globalSearch.openAdvancedSearch(query);
        })
      );
      this._updateButtonState();
    }
    onunload() {
      this.headerRow.remove();
    }
    toggle = () => {
      const settings = useService("settings");
      const currentValue = settings.get(this.SETTING_KEY);
      settings.set(this.SETTING_KEY, !currentValue);
      this._updateButtonState();
    };
    _isEnabled() {
      return useService("settings").get(this.SETTING_KEY);
    }
    _injectButton() {
      const inputEl = document.querySelector("#file-library-search-input");
      if (!inputEl?.parentElement) return;
      this.btnEl = html`<button class="ty-plugin-advanced-search-btn">✨</button>`;
      this.btnEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      this.headerRow = document.createElement("div");
      this.headerRow.className = "ty-plugin-search-header";
      this.labelEl = document.createElement("span");
      this.labelEl.textContent = "Search";
      this.headerRow.appendChild(this.labelEl);
      this.headerRow.appendChild(this.btnEl);
      const panel = document.getElementById("file-library-search-panel");
      if (panel && inputEl) {
        panel.insertBefore(this.headerRow, inputEl);
      }
    }
    _updateButtonState() {
      const enabled = this._isEnabled();
      const t = this.i18n.t.sidebar.search;
      document.body.classList.toggle("ty-advanced-search-active", enabled);
      this.labelEl.textContent = enabled ? t.advancedMode : t.commonMode;
      this.labelEl.title = enabled ? t.advancedModeDesc : "";
      this.btnEl.classList.toggle("ty-active", enabled);
      this.btnEl.title = t.advancedMode;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/views/global-search-view.ts
  var SELECTOR_QUERY_INPUT = "#file-library-search-input";
  var GlobalSearchView = class _GlobalSearchView extends InternalSidebarPanel {
    static get id() {
      return "core.search";
    }
    /** @private */
    renderer = new SearchResultRenderer();
    _keepSearchResult = new KeepSearchResult();
    _showSearchResultFullPath = new ShowSearchResultFullPath();
    _advancedSearchMode = new AdvancedSearchMode();
    progressBar = new GlobalSearchProgressbar();
    constructor(i18n = useService("i18n")) {
      super();
      this.containerEl = document.getElementById("file-library-search");
      this.addRibbonButton({
        [BUILT_IN]: true,
        id: _GlobalSearchView.id,
        title: i18n.t.ribbon.search,
        icon: html`<i class="fa fa-search typ-lighter-icon"></i>`
      });
    }
    onshow() {
      $("#typora-sidebar").addClass("ty-on-search");
      editor.library.fileSearch.show();
      this.progressBar.load();
    }
    onhide() {
      $("#typora-sidebar").removeClass("ty-show-search ty-on-search");
      this.progressBar.unload();
    }
    getQuery() {
      return $(SELECTOR_QUERY_INPUT).val() ?? "";
    }
    setQuery(query) {
      $(SELECTOR_QUERY_INPUT).val(query);
    }
  };
  var KeepSearchResult = class extends Component {
    constructor(settings = useService("settings"), sidebar = useService("sidebar")) {
      super();
      this.settings = settings;
      this.sidebar = sidebar;
      const { SETTING_KEY } = this;
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    SETTING_KEY = "keepSearchResult";
    onload() {
      this.register(
        decorate(editor.library.fileSearch, "clearSearch", () => noop)
      );
    }
    showSearchPanel() {
      if (this.settings.get(this.SETTING_KEY))
        $("#typora-sidebar").addClass("ty-on-search");
    }
  };
  var ShowSearchResultFullPath = class extends Component {
    observer = new MutationObserver((_) => this.appendTitle(_));
    constructor(settings = useService("settings")) {
      super();
      const SETTING_KEY = "showSearchResultFullPath";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    appendTitle = (mutationsList) => {
      mutationsList.forEach((mutation) => {
        if (mutation.type !== "childList") return;
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const loc = node.querySelector(".file-list-item-parent-loc");
          if (!loc) return;
          loc.title = loc.innerText;
        });
      });
    };
    onload() {
      const resultsEl = $("#file-library-search-result").get(0);
      if (!resultsEl) return;
      this.observer.observe(resultsEl, {
        attributes: false,
        childList: true,
        subtree: true
      });
    }
    onunload() {
      this.observer.disconnect();
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/text-search-service.ts
  var RipgrepSearchService = class {
    constructor(mountFolder) {
      this.mountFolder = mountFolder;
    }
    _rpTask1 = null;
    // content match
    _rpTask2 = null;
    // filename fuzzy match
    _rpTask3 = null;
    // file list (filename only)
    /** Accumulator for streaming JSON Lines from task1 */
    _prevBuffer = "";
    /** Accumulator for streaming JSON Lines from task2 (pathMatch=true) */
    _pathPrevBuffer = "";
    /** Accumulates results by file path so we emit complete SearchResult objects.
     *
     * Typora's native implementation (frame.js ~14236-14379) uses an accumulator pattern:
     * `begin` creates { path, matches: [] }, `match` pushes into it, `end` renders the
     * complete accumulated result. Our custom service must do the same — emit one
     * SearchResult per file with ALL its matches, not one SearchResult per match event.
     *
     * We accumulate across all 3 tasks and only flush after ALL close, so that a file
     * appearing in both Task 1 (content) and Task 2/3 (filename-only) gets merged into
     * ONE complete SearchResult instead of creating duplicate DOM entries.
     */
    _resultsByPath = /* @__PURE__ */ new Map();
    /** Tracks how many tasks have closed; flush only when all 3 are done. */
    _tasksClosedCount = 0;
    /** Kill all running ripgrep processes. Call before starting a new search. */
    cancel() {
      this._killTask(this._rpTask1);
      this._killTask(this._rpTask2);
      this._killTask(this._rpTask3);
      this._rpTask1 = null;
      this._rpTask2 = null;
      this._rpTask3 = null;
      this._resultsByPath.clear();
      this._tasksClosedCount = 0;
    }
    /**
     * Execute global search. On Windows/Linux, spawns 3 parallel ripgrep processes.
     * On macOS, delegates to native bridge handler.
     *
     * @param query - Single string (searched as-is) or string[] (each token passed
     *                as separate `-e` flag, OR semantics — AST evaluates AND later).
     */
    execute(query, options) {
      this.cancel();
      const caseSensitive = options?.caseSensitive ?? false;
      const wholeWord = options?.wholeWord ?? false;
      const { onResult, onComplete } = options ?? {};
      if (platform() === "darwin") {
        this._executeOnMac(query, caseSensitive, wholeWord, onResult);
        onComplete?.();
      } else {
        this._executeOnNode(query, caseSensitive, wholeWord, onResult, onComplete);
      }
    }
    /**
     * Normalize query to a string array for internal use.
     */
    _normalizeQuery(query) {
      return typeof query === "string" ? [query] : query;
    }
    /**
     * Execute global search on macOS.
     */
    _executeOnMac(query, caseSensitive = false, wholeWord = false, onResult, onComplete) {
      const queryStr = typeof query === "string" ? query : query.join(" ");
      const nfdQuery = this._normalizeNFD(queryStr);
      bridge.callHandler("library.search", {
        text: queryStr,
        caseSensitive,
        wholeWord,
        args: this._buildRpArgs(query, caseSensitive, wholeWord)
      }, noop);
    }
    _executeOnNode(query, caseSensitive, wholeWord, onResult = noop, onComplete) {
      const rg = this._getRipgrepPath();
      if (!rg) {
        onComplete?.();
        return;
      }
      const child_process = this._reqChildProcess();
      const cwd = this.mountFolder;
      const spawnRg = (args) => {
        const proc = child_process.spawn(rg, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"]
        });
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        return proc;
      };
      const task1Args = this._buildRpArgs(query, caseSensitive, wholeWord);
      const task1 = spawnRg(task1Args);
      this._rpTask1 = task1;
      task1.stdout?.on("data", (chunk) => {
        this._parseJsonLines(chunk, false);
      });
      task1.on("close", () => {
        this._rpTask1 = null;
        this._flushResults(onResult, onComplete);
      });
      task1.stderr?.on("data", () => {
      });
      const queryStr = typeof query === "string" ? query : query.join(" ");
      const escapedQuery = this._escapeRegExp(queryStr);
      const task2Args = [
        "-m",
        "2",
        "--max-filesize",
        "2M",
        ".*",
        "-H",
        "-U",
        "--json",
        "--no-messages",
        caseSensitive ? "-g" : "--iglob",
        `*${escapedQuery}*`
      ];
      const task2 = spawnRg(task2Args);
      this._rpTask2 = task2;
      task2.stdout?.on("data", (chunk) => {
        this._parseJsonLines(chunk, true);
      });
      task2.on("close", () => {
        this._rpTask2 = null;
        this._flushResults(onResult, onComplete);
      });
      const task3Args = [
        "--max-filesize",
        "0K",
        "--files",
        "--no-messages",
        caseSensitive ? "-g" : "--iglob",
        `*${escapedQuery}*`
      ];
      const task3 = spawnRg(task3Args);
      this._rpTask3 = task3;
      let task3HasResults = false;
      task3.stdout?.on("data", (chunk) => {
        const lines = chunk.split(/\r?\n/g);
        for (const line of lines) {
          if (!line || line.length > 1e4) continue;
          const absPath = path_default.isAbsolute(line) ? line : path_default.join(this.mountFolder, line);
          this._resultsByPath.set(absPath, {
            filePath: absPath,
            matches: [],
            totalMatches: 0
          });
          task3HasResults = true;
        }
      });
      task3.on("close", () => {
        this._rpTask3 = null;
        this._flushResults(onResult, onComplete);
      });
    }
    /**
     * Parse ripgrep JSON Lines output and convert to SearchResult objects.
     *
     * Ripgrep --json outputs one JSON object per line:
     * - {"type":"match","data":{"path":{"text":"..."},"span":{"line":N,...},"lines":["..."],"submatches":[...]}}
     * - {"type":"stats","data":{"matches":N,...}}
     */
    _parseJsonLines(chunk, pathMatch) {
      const buf = pathMatch ? this._pathPrevBuffer : this._prevBuffer;
      const combined = buf + chunk;
      const lines = combined.split(/\r?\n/g);
      const completeLines = lines.slice(0, -1);
      if (pathMatch) {
        this._pathPrevBuffer = lines.at(-1) ?? "";
      } else {
        this._prevBuffer = lines.at(-1) ?? "";
      }
      for (const line of completeLines) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed.type !== "match" || !parsed.data) continue;
        this._processMatch(parsed.data, pathMatch);
      }
    }
    _processMatch(data, pathMatch) {
      const pathData = data.path;
      if (!pathData?.text) return;
      const filePath = pathData.text;
      const absPath = path_default.isAbsolute(filePath) ? filePath : path_default.join(this.mountFolder, filePath);
      if (!pathMatch) {
        const span = data.span;
        const linesData = data.lines;
        const submatches = data.submatches;
        let lineNumber = 0;
        let lineText = "";
        let matchedText = "";
        lineNumber = data.line_number ?? span?.line ?? 0;
        if (linesData?.text?.length) {
          lineText = linesData.text.replace(/[\r\n]/g, "");
        }
        if (submatches?.length) {
          const firstSubmatch = submatches[0];
          const matchData = firstSubmatch.match;
          matchedText = matchData?.text ?? "";
        }
        let entry = this._resultsByPath.get(absPath);
        if (!entry) {
          entry = { filePath: absPath, matches: [], totalMatches: 0 };
          this._resultsByPath.set(absPath, entry);
        }
        entry.matches.push({ lineNumber, lineText, matchedText });
      } else {
        if (!this._resultsByPath.has(absPath)) {
          this._resultsByPath.set(absPath, {
            filePath: absPath,
            matches: [],
            totalMatches: 0
          });
        }
      }
    }
    _flushResults(onResult, onComplete) {
      this._tasksClosedCount++;
      if (this._tasksClosedCount < 3) {
        return;
      }
      for (const result of this._resultsByPath.values()) {
        result.totalMatches = result.matches.length;
        onResult(result);
      }
      this._resultsByPath.clear();
      this._tasksClosedCount = 0;
      onComplete?.();
    }
    /** Kill a child process and clean up references. */
    _killTask(proc) {
      if (proc && !proc.killed) {
        try {
          proc.kill();
        } catch {
        }
      }
    }
    /** Get the ripgrep binary path from vscode-ripgrep. */
    _getRipgrepPath() {
      try {
        const rgModule = globalThis.reqnode?.("vscode-ripgrep");
        if (!rgModule) return null;
        let path2 = rgModule.rgPath ?? "";
        path2 = path2.replace("node_modules.asar", "node_modules");
        return path2 || null;
      } catch {
        return null;
      }
    }
    /** Require child_process module. */
    _reqChildProcess() {
      return globalThis.reqnode?.("child_process") ?? reqnode("child_process");
    }
    /** Build ripgrep arguments for content search. */
    _buildRpArgs(query, caseSensitive, wholeWord) {
      const patterns = typeof query === "string" ? [query] : query;
      const args = [
        "--json",
        "-F",
        // fixed string match (no regex)
        "--no-multiline",
        "-n",
        // show line numbers
        "-m",
        "10",
        // max 10 matches per file
        "--max-filesize",
        "2M",
        "-g",
        "!.*",
        "--no-messages"
      ];
      for (const p of patterns) {
        args.push("-e", p);
      }
      if (!caseSensitive) {
        args.splice(args.indexOf("-F") + 1, 0, "-i");
      }
      if (wholeWord) {
        const firstPatternIdx = args.indexOf("-e");
        if (firstPatternIdx >= 0) {
          args.splice(firstPatternIdx, 0, "-w");
        }
      }
      return args;
    }
    /** Normalize query to NFD form for better Unicode matching on macOS. */
    _normalizeNFD(str) {
      return str.normalize("NFD");
    }
    /** Escape special regex characters in a string. */
    _escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/tokenizer.ts
  function tokenize(query) {
    const tokens = [];
    let i = 0;
    while (i < query.length) {
      if (/\s/.test(query[i])) {
        i++;
        continue;
      }
      let negated = false;
      if (query[i] === "-") {
        negated = true;
        i++;
      }
      if (query[i] === '"') {
        const end = query.indexOf('"', i + 1);
        if (end < 0) {
          tokens.push({ value: query.slice(i + 1), isField: false, isQuoted: false, isNegated: negated });
          break;
        }
        const quoted = query.slice(i + 1, end).trim();
        if (quoted) {
          tokens.push({ value: quoted, isField: false, isQuoted: true, isNegated: negated });
        }
        i = end + 1;
        continue;
      }
      if (query[i] === "(" || query[i] === ")") {
        tokens.push({ value: query[i], isField: false, isQuoted: false, isNegated: negated });
        i++;
        continue;
      }
      const fieldMatch = query.slice(i).match(/^(tag|title|filename):(.+?)(?=\s|$)/i);
      if (fieldMatch && isKnownFieldPrefix(fieldMatch[1].toLowerCase())) {
        tokens.push({
          value: fieldMatch[2].trim(),
          field: fieldMatch[1].toLowerCase(),
          isField: true,
          isQuoted: false,
          isNegated: negated
        });
        i += fieldMatch[0].length;
        continue;
      }
      const rest = query.slice(i);
      const bareOffset = rest.search(/[\s"()]/);
      const bareEnd = bareOffset < 0 ? -1 : i + bareOffset;
      const bareWord = bareEnd < 0 ? query.slice(i).trim() : query.slice(i, bareEnd).trim();
      if (bareWord) {
        tokens.push({ value: bareWord, isField: false, isQuoted: false, isNegated: negated });
      }
      i = bareEnd < 0 ? query.length : bareEnd;
    }
    return tokens;
  }
  var KNOWN_FIELD_PREFIXES = ["tag", "title", "filename"];
  function isKnownFieldPrefix(str) {
    return KNOWN_FIELD_PREFIXES.includes(str);
  }

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/syntax/tag-syntax.ts
  var TagSyntaxHandler = {
    name: "tag",
    tryParse(value) {
      return { type: "field", field: "tag", pattern: value };
    },
    extractSearchText(node) {
      return `#${node.pattern}`;
    },
    evaluate(node, context) {
      const fmTags = context.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        if (fmTags.some((t) => t === node.pattern)) return true;
      }
      if (typeof fmTags === "string") {
        if (fmTags === node.pattern) return true;
      }
      const patternLower = node.pattern.toLowerCase();
      for (const tag of context.inlineTags ?? []) {
        if (tag.toLowerCase() === patternLower) return true;
      }
      return false;
    },
    collectFieldMatches(node, context) {
      const matches = [];
      const tagsList = context.frontmatter.tags;
      if (Array.isArray(tagsList)) {
        for (let i = 0; i < tagsList.length; i++) {
          if (tagsList[i] === node.pattern) {
            let lineNumber = 0;
            let lineText = `tag: ${tagsList[i]}`;
            if (context.tags) {
              lineNumber = context.tags[i]?.lineNumber ?? 0;
              lineText = context.tags[i]?.lineText ?? lineText;
            }
            matches.push({
              lineNumber,
              lineText,
              matchedText: tagsList[i],
              source: "field:tag"
            });
          }
        }
      } else if (typeof tagsList === "string") {
        if (tagsList === node.pattern) {
          let lineNumber = 0;
          let lineText = `tag: ${tagsList}`;
          if (context.tags?.length) {
            lineNumber = context.tags[0].lineNumber;
            lineText = context.tags[0].lineText;
          }
          matches.push({
            lineNumber,
            lineText,
            matchedText: node.pattern,
            source: "field:tag"
          });
        }
      }
      return matches;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/syntax/title-syntax.ts
  var TitleSyntaxHandler = {
    name: "title",
    tryParse(value) {
      return { type: "field", field: "title", pattern: value };
    },
    extractSearchText() {
      return null;
    },
    evaluate(node, context) {
      const fmTitle = String(context.frontmatter.title ?? "");
      if (fmTitle.includes(node.pattern)) return true;
      if (context.titles?.some((t) => t.name.includes(node.pattern))) return true;
      return false;
    },
    collectFieldMatches(node, context) {
      const matches = [];
      const fmValue = String(context.frontmatter.title ?? "");
      if (fmValue.includes(node.pattern)) {
        matches.push({
          lineNumber: 0,
          lineText: `title: ${fmValue}`,
          matchedText: node.pattern,
          source: "field:title"
        });
      }
      if (context.titles) {
        for (const t of context.titles) {
          if (t.name.includes(node.pattern)) {
            matches.push({
              lineNumber: t.lineNumber,
              lineText: t.lineText,
              matchedText: t.name,
              source: "field:title"
            });
          }
        }
      }
      return matches;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/syntax/filename-syntax.ts
  var FilenameSyntaxHandler = {
    name: "filename",
    tryParse(value) {
      return { type: "field", field: "filename", pattern: value };
    },
    extractSearchText() {
      return null;
    },
    evaluate(node, context) {
      if (!context.filePath) return false;
      const fileName = path_default.basename(context.filePath);
      return fileName.toLowerCase().includes(node.pattern.toLowerCase());
    },
    collectFieldMatches(node, context) {
      if (!context.filePath) return [];
      const fileName = path_default.basename(context.filePath);
      return [{
        lineNumber: 0,
        lineText: `filename: ${fileName}`,
        matchedText: node.pattern,
        source: "field:filename"
      }];
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/syntax/bareword-syntax.ts
  function tryParseBareword(value, isQuoted) {
    return { type: "term", pattern: value, isQuoted };
  }
  function evaluateTerm(node, context) {
    const pattern = node.pattern.toLowerCase();
    if (node.isQuoted) {
      for (const token of context.bodyTokens) {
        if (token.includes(pattern)) return true;
      }
      if (context.rawLines) {
        for (const line of context.rawLines) {
          if (line.includes(pattern)) return true;
        }
      }
      return false;
    }
    if (context.bodyTokens.has(pattern)) return true;
    if (context.rawLines) {
      for (const line of context.rawLines) {
        if (line.includes(pattern)) return true;
      }
    }
    return false;
  }

  // vendor/workspace_core/src/ui/sidebar/search/services/query-parser/index.ts
  var _handlers = /* @__PURE__ */ new Map();
  var _builtinHandlers = [
    TagSyntaxHandler,
    TitleSyntaxHandler,
    FilenameSyntaxHandler
  ];
  for (const h of _builtinHandlers) {
    _handlers.set(h.name, h);
  }
  function getHandler(field) {
    return _handlers.get(field);
  }
  function tryParse(query) {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const rawTokens = tokenize(trimmed);
    if (rawTokens.length === 0) return null;
    const { nodes } = _parseSequence(rawTokens, 0);
    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0] : { type: "or", children: nodes };
  }
  function _parseSequence(tokens, start) {
    const segments = [[]];
    let i = start;
    while (i < tokens.length) {
      const raw = tokens[i];
      if (raw.value === ")") {
        i++;
        break;
      }
      if (raw.value === "(") {
        const negated = raw.isNegated;
        i++;
        const { nodes: inner, end } = _parseSequence(tokens, i);
        i = end;
        if (inner.length > 0) {
          let group = inner.length === 1 ? inner[0] : { type: "and", children: inner };
          if (negated) group = { type: "not", child: group };
          segments[segments.length - 1].push(group);
        }
        continue;
      }
      if (!raw.isQuoted && !raw.isField && !raw.isNegated && raw.value === "OR") {
        segments.push([]);
        i++;
        continue;
      }
      const node = _parseRawToken(raw);
      if (node) {
        segments[segments.length - 1].push(node);
      }
      i++;
    }
    const nodes = segments.filter((seg) => seg.length > 0).map((seg) => seg.length === 1 ? seg[0] : { type: "and", children: seg });
    return { nodes, end: i };
  }
  function astHasFieldNodes(ast) {
    if (ast.type === "field") return true;
    if (ast.type === "and" || ast.type === "or") {
      return ast.children.some((child) => astHasFieldNodes(child));
    }
    if (ast.type === "not") return astHasFieldNodes(ast.child);
    return false;
  }
  function astHasField(ast, fieldName) {
    if (ast.type === "field" && ast.field === fieldName) return true;
    if (ast.type === "and" || ast.type === "or") {
      return ast.children.some((child) => astHasField(child, fieldName));
    }
    if (ast.type === "not") return astHasField(ast.child, fieldName);
    return false;
  }
  function _parseRawToken(raw) {
    if (!raw.value) return null;
    if (raw.isQuoted) {
      return _wrapNegated(raw, tryParseBareword(raw.value, true));
    }
    if (raw.isField && raw.field) {
      const handler = _handlers.get(raw.field);
      if (handler) {
        const node2 = handler.tryParse(raw.value);
        if (node2) return _wrapNegated(raw, node2);
      }
    }
    const colonIdx = raw.value.indexOf(":");
    if (colonIdx > 0) {
      const prefix = raw.value.slice(0, colonIdx).toLowerCase();
      const handler = _handlers.get(prefix);
      if (handler) {
        const value = raw.value.slice(colonIdx + 1).trim();
        if (value) {
          const node2 = handler.tryParse(value);
          if (node2) return _wrapNegated(raw, node2);
        }
      }
    }
    const node = tryParseBareword(raw.value, false);
    return raw.isNegated ? { type: "not", child: node } : node;
  }
  function _wrapNegated(raw, node) {
    return raw.isNegated ? { type: "not", child: node } : node;
  }

  // vendor/workspace_core/src/ui/sidebar/search/services/result-builder.ts
  function buildSearchResult(textResult, frontmatter, ast, tags, titles) {
    const bodyTokens = collectBodyTokens(textResult.matches);
    const inlineTags = collectInlineTagPatterns(textResult.matches);
    const rawLines = textResult.matches.map((m) => m.lineText.toLowerCase());
    const context = { bodyTokens, rawLines, frontmatter, tags, titles, inlineTags, filePath: textResult.filePath };
    if (!evaluateAST(ast, context)) {
      return null;
    }
    const hasTagField = astHasField(ast, "tag");
    const enrichedMatches = textResult.matches.filter((match2) => {
      if (hasTagField && match2.matchedText.startsWith("#")) {
        return _isInlineTagAtValidPosition(match2.lineText, match2.matchedText);
      }
      return true;
    }).map((match2) => ({
      ...match2,
      source: "body"
    }));
    const fieldMatches = collectFieldMatches(ast, context);
    enrichedMatches.push(...fieldMatches);
    return {
      filePath: textResult.filePath,
      matches: enrichedMatches,
      totalMatches: enrichedMatches.length
    };
  }
  function collectBodyTokens(matches) {
    const tokens = /* @__PURE__ */ new Set();
    for (const match2 of matches) {
      const lineTokens = tokenizeLine(match2.lineText);
      lineTokens.forEach((t) => tokens.add(t.toLowerCase()));
    }
    return tokens;
  }
  function collectInlineTagPatterns(matches) {
    const tags = /* @__PURE__ */ new Set();
    for (const match2 of matches) {
      const inlineTags = match2.lineText.match(/(?:^|\s)(#[a-zA-Z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][a-zA-Z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af0-9_/-]*)/g);
      if (inlineTags) {
        for (const tag of inlineTags) {
          tags.add(tag.trim().slice(1).toLowerCase());
        }
      }
    }
    return tags;
  }
  function tokenizeLine(text) {
    const matches = text.match(/[a-zA-Z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
    return matches ? matches.map((m) => m.toLowerCase()) : [];
  }
  function _isInlineTagAtValidPosition(lineText, matchedText) {
    let idx = 0;
    while (idx < lineText.length) {
      idx = lineText.indexOf(matchedText, idx);
      if (idx === -1) return false;
      if (idx === 0 || /\s/.test(lineText[idx - 1])) return true;
      idx += matchedText.length;
    }
    return false;
  }
  function collectFieldMatches(ast, context) {
    const matches = [];
    const visit = (node) => {
      if (node.type === "and" || node.type === "or") {
        for (const child of node.children) {
          visit(child);
        }
      } else if (node.type === "not") {
      } else if (node.type === "field") {
        const fieldNode = node;
        const handler = getHandler(fieldNode.field);
        if (handler) {
          const fieldMatches = handler.collectFieldMatches(fieldNode, context);
          matches.push(...fieldMatches);
        }
      }
    };
    visit(ast);
    return matches;
  }
  function evaluateAST(ast, context) {
    switch (ast.type) {
      case "and": {
        const node = ast;
        return node.children.every((child) => evaluateAST(child, context));
      }
      case "or": {
        const node = ast;
        return node.children.some((child) => evaluateAST(child, context));
      }
      case "not": {
        const node = ast;
        return !evaluateAST(node.child, context);
      }
      case "term": {
        return evaluateTerm(ast, context);
      }
      case "field": {
        const node = ast;
        const handler = getHandler(node.field);
        if (handler) return handler.evaluate(node, context);
        return false;
      }
    }
    return false;
  }

  // vendor/workspace_core/src/ui/sidebar/search/services/index-search-service.ts
  var IndexSearchService = class {
    _metadata = useService("metadata-manager");
    _vault = useService("vault");
    _astCache = /* @__PURE__ */ new Map();
    /** Parse and cache a query into an AST. Returns null if no structured tokens found. */
    getAST(query) {
      const cached = this._astCache.get(query);
      if (cached) return cached;
      const ast = tryParse(query);
      if (ast) {
        this._astCache.set(query, ast);
      }
      return ast;
    }
    /** Collect text tokens from AST for ripgrep search. */
    extractTextTokens(ast) {
      return this.extractTextTokenList(ast).join(" ");
    }
    /**
     * Extract individual text tokens from AST.
     * Unlike extractTextTokens (which joins everything), this returns the raw
     * array so ripgrep can search each token independently with -e flags.
     * This is critical for AND queries like `tag:foo Title` — without it,
     * ripgrep treats "#foo Title" as a single literal phrase, missing files
     * where #foo and Title are on different lines.
     */
    extractTextTokenList(ast) {
      const tokens = [];
      const visit = (node) => {
        if (node.type === "and" || node.type === "or") {
          for (const child of node.children) {
            visit(child);
          }
        } else if (node.type === "not") {
        } else if (node.type === "field") {
          const handler = getHandler(node.field);
          if (handler) {
            const text = handler.extractSearchText(node);
            if (text !== null) tokens.push(text);
          }
        } else if (node.type === "term") {
          tokens.push(node.pattern);
        }
      };
      visit(ast);
      return tokens;
    }
    /**
     * Index-only search: scan metadata cache when no text tokens to search with ripgrep.
     */
    indexOnlySearch(ast, onResult) {
      const entries = Object.entries(this._metadata.cache);
      for (const [relPath, entry] of entries) {
        const frontmatter = entry.metadata?.frontmatter ?? {};
        const context = {
          bodyTokens: /* @__PURE__ */ new Set(),
          frontmatter,
          tags: entry.metadata?.tags,
          titles: entry.metadata?.titles,
          filePath: relPath
        };
        if (!evaluateAST(ast, context)) {
          continue;
        }
        const fieldMatches = collectFieldMatches(ast, context);
        if (onResult) {
          const absPath = path_default.isAbsolute(relPath) ? relPath : path_default.join(this._vault.path, relPath);
          console.log("[IndexSearch] Index-only match:", absPath, "matches:", fieldMatches.length);
          onResult({
            filePath: absPath,
            matches: fieldMatches,
            totalMatches: fieldMatches.length
          });
        }
      }
    }
    /**
     * Build a final search result by combining text search output with metadata enrichment.
     */
    buildResult(textResult, ast) {
      const relPath = path_default.isAbsolute(textResult.filePath) ? path_default.relative(this._vault.path, textResult.filePath) : textResult.filePath;
      const entry = this._metadata.get(relPath);
      if (!entry) return null;
      const finalResult = buildSearchResult(
        textResult,
        entry.metadata?.frontmatter ?? {},
        ast,
        entry.metadata?.tags,
        entry.metadata?.titles
      );
      return finalResult;
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/services/hybrid-search-service.ts
  var HybridSearchService = class {
    _textSearcher;
    _indexSearcher = new IndexSearchService();
    constructor(textSearcher) {
      this._textSearcher = textSearcher;
    }
    /**
     * Execute hybrid search.
     * Delegates to ripgrep for pure text queries; enriches results with metadata for structured queries.
     */
    execute(query, options) {
      const { onResult, onComplete } = options ?? {};
      const ast = this._indexSearcher.getAST(query);
      if (!ast) {
        this._textSearcher.execute(query, options);
        return;
      }
      const textTokens = this._indexSearcher.extractTextTokenList(ast);
      const hasFieldNodes = astHasFieldNodes(ast);
      if (textTokens.length === 0) {
        console.log("[HybridSearch] Index-only search (no text tokens), scanning metadata cache");
        this._indexSearcher.indexOnlySearch(ast, onResult);
        onComplete?.();
        return;
      }
      if (hasFieldNodes) {
        this._indexSearcher.indexOnlySearch(ast, onResult);
      }
      this._textSearcher.execute(textTokens, {
        ...options,
        onResult: (textResult) => {
          const finalResult = this._indexSearcher.buildResult(textResult, ast);
          if (finalResult && onResult) {
            onResult(finalResult);
          }
        }
      });
    }
    /** Cancel any running search. */
    cancel() {
      this._textSearcher.cancel();
    }
  };

  // vendor/workspace_core/src/ui/sidebar/search/global-search.ts
  var ORIGINAL_KEY = Symbol.for("search$original");
  var GlobalSearch = class {
    constructor(workspace = useService("workspace"), vault = useService("vault")) {
      this.workspace = workspace;
      this.vault = vault;
      this._searchService = new RipgrepSearchService(vault.path);
      this._hybridSearch = new HybridSearchService(this._searchService);
      vault.on("change", (vaultPath) => {
        this._searchService = new RipgrepSearchService(vaultPath);
        this._hybridSearch = new HybridSearchService(this._searchService);
      });
    }
    _searchService;
    _hybridSearch;
    openGlobalSearch(query) {
      const { workspace } = this;
      workspace.ribbon.clickButton(GlobalSearchView.id);
      const view = workspace.getViewByType(GlobalSearchView);
      view.setQuery(query);
      const originalSearch = editor.library.fileSearch[ORIGINAL_KEY] ?? editor.library.fileSearch.search;
      originalSearch.call(editor.library.fileSearch, query);
    }
    /**
     * Open the global search panel and execute a search with the given query.
     *
     * The query is always dispatched through HybridSearchService, which parses
     * it into an AST. Structured tokens (tag:/title:/filename:) and multiple
     * bare words produce an AND tree; pure single-word queries fall through to
     * ripgrep directly.
     *
     * @param query - The search string entered by the user. May contain field
     *                prefixes (`tag:`, `title:`, `filename:`) and/or bare words.
     */
    openAdvancedSearch(query) {
      const { workspace } = this;
      const isActive = $("#typora-sidebar").hasClass("ty-show-search");
      if (!isActive) {
        workspace.ribbon.clickButton(GlobalSearchView.id);
      }
      const view = workspace.getViewByType(GlobalSearchView);
      view.setQuery(query);
      view.renderer.clearResults();
      view.progressBar.show();
      const caseSensitive = editor.library.fileSearch.caseSensitive ?? false;
      const wholeWord = editor.library.fileSearch.wholeWord ?? false;
      this._searchService.cancel();
      this._hybridSearch.execute(query, {
        caseSensitive,
        wholeWord,
        onResult: (result) => view.renderer.renderResult(result),
        onComplete: () => view.renderer.onDrain(() => view.progressBar.hide())
      });
    }
    getGlobalSearchQuery() {
      const view = this.workspace.getViewByType(GlobalSearchView);
      return view?.getQuery() ?? "";
    }
  };

  // vendor/workspace_core/src/ui/statusbar/statistics.ts
  var TBODY_SEL = "li.ty-footer-word-count-all table tbody";
  var SELECTION_TBODY_SEL = "li.footer-word-count-selection table tbody";
  var DOM_STAT_IDS = {
    "reading-time": "#footer-read-time-count-td",
    "lines": "#footer-line-count-td",
    "words": "#footer-word-count-td",
    "characters": "#footer-char-count-td",
    "selected-words": "#footer-word-count-td-sel",
    "selected-characters": "#footer-char-count-td-sel"
  };
  var StatisticContext = class {
    _markdown;
    _values = {};
    /** Lazily reads the current document's markdown once; subsequent accesses return the cached value. */
    get markdown() {
      return this._markdown ??= editor.getMarkdown();
    }
    /**
     * Reads the currently selected plain text (not markdown) from the DOM.
     * Returns an empty string when no selection exists.
     */
    get selectionText() {
      return window.getSelection()?.toString() ?? "";
    }
    /**
     * Get a stat's result by its `id`. Returns `null` if not yet computed or was hidden.
     *
     * For the built-in Typora footer stats (`reading-time`, `lines`, `words`, `characters`, `selected-words`, `selected-characters`),
     * falls back to lazily reading from the raw DOM when no previously computed value exists.
     */
    get(id) {
      return this._values[id] ?? this._lazyFromDOM(id);
    }
    /** Lazy-load a built-in stat value from the Typora footer DOM. */
    _lazyFromDOM(id) {
      const selector = DOM_STAT_IDS[id];
      if (!selector) return null;
      const el = document.querySelector(selector);
      const val = el?.textContent?.trim() ?? null;
      this._values[id] = val;
      return val;
    }
    /** Set a value under any stat's id (including the current one) so it can be read via {@link get}. Use `null` to indicate hidden/skipped. Call from within {@link StatisticHandler.eval} — pass your own id or another stat's id. */
    set(id, value) {
      this._values[id] = value;
    }
  };
  var Statistics = class extends Component {
    _stats = [];
    _selectionStats = [];
    _observer = null;
    onload() {
      this.register(
        decorate.afterCall(editor.wordCount, "updateLabel", () => {
          this._updateAllStats();
          this._updateAllSelectionStats();
        })
      );
      this._observePanelClass();
    }
    onunload() {
      this._disconnectObserver();
      this._removeInjectedRows();
      this._removeInjectedSelectionRows();
      this._stats = [];
      this._selectionStats = [];
    }
    /* ─── public registry ────────────────────────────────── */
    /**
     * Register a statistic row.
     *
     * If the word count panel is already open the row is injected and synced
     * immediately.  Returns a dispose function that unregisters the statistic
     * and removes its DOM row.
     */
    registerStatistic(stat) {
      if (this._stats.some((s) => s.id === stat.id)) throw new Error(`[WordCountStatistics] Duplicate statistic id: "${stat.id}"`);
      this._stats.push(stat);
      if (document.body.classList.contains("ty-show-word-count")) {
        this._injectRow(stat);
        this._updateStat(stat, new StatisticContext());
      }
      return () => {
        this._stats = this._stats.filter((s) => s !== stat);
        $(`#typ-wc-${stat.id}`).closest("tr").remove();
      };
    }
    /**
     * Register a statistic row in the selection section of the word-count panel.
     *
     * If the panel is open the row is injected and synced immediately.
     * Returns a dispose function that unregisters the statistic and removes its DOM row.
     */
    registerSelectionStatistic(stat) {
      if (this._selectionStats.some((s) => s.id === stat.id)) throw new Error(`[WordCountStatistics] Duplicate selection statistic id: "${stat.id}"`);
      this._selectionStats.push(stat);
      if (document.body.classList.contains("ty-show-word-count")) {
        this._injectSelectionRow(stat);
        this._updateSelectionStat(stat, new StatisticContext());
      }
      return () => {
        this._selectionStats = this._selectionStats.filter((s) => s !== stat);
        $(`#typ-wc-sel-${stat.id}`).closest("tr").remove();
      };
    }
    /* ─── mutation observer on body class ────────────────── */
    _observePanelClass() {
      this._observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== "attributes") continue;
          const target = mutation.target;
          if (target.classList.contains("ty-show-word-count")) this._onPanelOpen();
          else this._onPanelClose();
          break;
        }
      });
      this._observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    _disconnectObserver() {
      this._observer?.disconnect();
      this._observer = null;
    }
    /* ─── panel open / close handlers ────────────────────── */
    _onPanelOpen() {
      if (this._stats.length > 0 && !document.querySelector(`#typ-wc-${this._stats[0].id}`)) {
        this._stats.forEach((s) => this._injectRow(s));
      }
      if (this._selectionStats.length > 0 && !document.querySelector(`#typ-wc-sel-${this._selectionStats[0].id}`)) {
        this._selectionStats.forEach((s) => this._injectSelectionRow(s));
      }
      this._updateAllStats();
      this._updateAllSelectionStats();
    }
    _onPanelClose() {
      this._removeInjectedRows();
      this._removeInjectedSelectionRows();
    }
    _updateAllStats = throttle(() => {
      if (!document.body.classList.contains("ty-show-word-count")) return;
      const context = new StatisticContext();
      this._stats.forEach((s) => this._updateStat(s, context));
    }, 167);
    _updateAllSelectionStats = throttle(() => {
      if (!document.body.classList.contains("ty-show-word-count")) return;
      const context = new StatisticContext();
      this._selectionStats.forEach((s) => this._updateSelectionStat(s, context));
    }, 167);
    _updateStat(stat, context) {
      const $cell = $(`#typ-wc-${stat.id}`);
      if (!$cell.length) return;
      const val = stat.eval(context);
      context.set(stat.id, val);
      val === null ? $cell.closest("tr").hide() : ($cell.closest("tr").show(), $cell.text(val));
    }
    _updateSelectionStat(stat, context) {
      const $cell = $(`#typ-wc-sel-${stat.id}`);
      if (!$cell.length) return;
      const val = stat.eval(context);
      context.set(stat.id, val);
      val === null ? $cell.closest("tr").hide() : ($cell.closest("tr").show(), $cell.text(val));
    }
    /* ─── inject all rows ────────────────────────────────── */
    _injectRow(stat) {
      const $tbody = $(TBODY_SEL);
      if ($tbody.length) {
        $tbody.append(`<tr><td id="typ-wc-${stat.id.replace(/#/g, "\\#")}">-</td><td>${stat.name}</td><td></td></tr>`);
      }
    }
    _injectSelectionRow(stat) {
      const $tbody = $(SELECTION_TBODY_SEL);
      if ($tbody.length) {
        $tbody.append(`<tr><td id="typ-wc-sel-${stat.id.replace(/#/g, "\\#")}">-</td><td>${stat.name}</td><td></td></tr>`);
      }
    }
    _removeInjectedRows() {
      this._stats.forEach((s) => $(`#typ-wc-${s.id}`).closest("tr").remove());
    }
    _removeInjectedSelectionRows() {
      this._selectionStats.forEach((s) => $(`#typ-wc-sel-${s.id}`).closest("tr").remove());
    }
  };

  // vendor/workspace_core/src/app.ts
  var App = class extends Events {
    _isReady = false;
    /**
     * @example app.coreVersion  //=> '2.0.0'
     */
    runtime_version = "2.10.15-typora-code.1";
    coreDir = coreDir();
    platform = platform();
    vault = useService("vault");
    config = useService("config-repository");
    settings;
    i18n;
    env = useService("env");
    hotkeyManager = useService("hotkey-manager");
    commands;
    viewManager;
    workspace;
    metadata;
    features;
    constructor() {
      super("app");
      Object.assign(window[Symbol.for("typora-code:workspace")], {
        ...index_exports,
        app: this
      });
      if (false) {
        window["Typora"] = window[Symbol.for("typora-code:workspace")];
      }
    }
    initialized = false;
    initialize() {
      if (this.initialized) return;
      this.initialized = true;
      this.settings = useService("settings");
      this.i18n = useService("i18n");
      this.commands = useService("command-manager");
      this.viewManager = useService("view-manager");
      this.workspace = useService("workspace");
      this.metadata = useService("metadata-manager");
      this.features = { exporter: useService("exporter"), globalSearch: new GlobalSearch(), markdownEditor: useService("markdown-editor"), markdownRenderer: useService("markdown-renderer"), statistics: new Statistics() };
    }
    started = false;
    start() {
      if (this.started) return;
      this.started = true;
      this.features.statistics.load();
      this.emit("load");
    }
    /**
     * @param link HTTP url or file path
     */
    openLink(link) {
      if (link.startsWith("http") || link.startsWith("#")) {
        editor.tryOpenUrl(link);
      } else {
        this.openFile(decodeURIComponent(link));
      }
    }
    /**
     * Open Markdown file with Typora or unsupported file with default app.
     *
     * @param filepath path of Markdown file or unsupported file
     */
    async openFile(filepath) {
      if (filepath.startsWith("<")) {
        filepath = filepath.slice(1, -1);
      }
      if (!path_default.isAbsolute(filepath)) {
        filepath = path_default.join(path_default.dirname(this.workspace.activeFile), filepath);
      }
      let url = { pathname: filepath };
      const basename = path_default.basename(filepath);
      if (basename.includes("#")) {
        url = await filesystem_default.access(filepath).then(() => url).catch(() => {
          const hashSplitorIdx = filepath.lastIndexOf("#");
          return {
            pathname: filepath.slice(0, hashSplitorIdx),
            hash: filepath.slice(hashSplitorIdx)
          };
        });
      }
      if (isMarkdownUrl(url.pathname)) {
        this.workspace.activeEditor.openFile(url);
      } else {
        this.openFileWithDefaultApp(filepath);
      }
    }
    /**
     * Open unsupported file with default app.
     *
     * @param filepath path of unsupported file
     */
    openFileWithDefaultApp(filepath) {
      return filesystem_default.access(filepath).then(() => JSBridge.invoke("shell.openItem", filepath)).catch((e) => this.logger.error(e));
    }
  };

  // vendor/workspace_core/src/hotkey-manager.ts
  var modifiers = ["metaKey", "ctrlKey", "shiftKey", "altKey"];
  var modifiersWeights = modifiers.reduce(
    (o, n, i) => (o[shorterModifierName(n)] = i, o),
    {}
  );
  var maxModifiersWeights = modifiers.length;
  var arrowKeys = {
    "arrowup": "\u2191",
    "arrowdown": "\u2193",
    "arrowleft": "\u2190",
    "arrowright": "\u2192"
  };
  var HotkeyManager = class {
    keybindings = {};
    editorKeybindings = {};
    constructor(markdownEditor = useEventBus("markdown-editor")) {
      markdownEditor.on("load", (editorEl) => {
        document.body.addEventListener("keyup", this._onKeyup(this.keybindings));
        editorEl.addEventListener("keyup", this._onKeyup(this.editorKeybindings));
      });
    }
    _onKeyup(keybindings) {
      return (event) => {
        const hotkey = eventToHotkey(event);
        keybindings[hotkey]?.forEach((listener) => listener(event));
      };
    }
    _addHotkey(keybindings, hotkey, listener) {
      const normalHotkey = normalizeHotkey(hotkey);
      if (!keybindings[normalHotkey]) {
        keybindings[normalHotkey] = [];
      }
      keybindings[normalHotkey].push(listener);
      return () => this._removeHotkey(keybindings, normalHotkey, listener, true);
    }
    _removeHotkey(keybindings, hotkey, listener, isNormal = false) {
      const normalHotkey = isNormal ? hotkey : normalizeHotkey(hotkey);
      const hotkeyBinds = keybindings[normalHotkey];
      if (!hotkeyBinds) return;
      keybindings[normalHotkey] = hotkeyBinds.filter((fn) => fn !== listener);
    }
    addHotkey(hotkey, listener) {
      return this._addHotkey(this.keybindings, hotkey, listener);
    }
    removeHotkey(hotkey, listener) {
      this._removeHotkey(this.keybindings, hotkey, listener);
    }
    addEditorHotkey(hotkey, listener) {
      return this._addHotkey(this.editorKeybindings, hotkey, listener);
    }
    removeEditorHotkey(hotkey, listener) {
      this._removeHotkey(this.editorKeybindings, hotkey, listener);
    }
  };
  function eventToHotkey(event) {
    return modifiers.filter((k) => event[k]).map(shorterModifierName).concat(shorterKeyName(event.key.toLowerCase())).join("+");
  }
  function normalizeHotkey(hotkey) {
    return hotkey.toLowerCase().replace(/cmd|command|win/, "meta").replace(/ctrl|control/, "ctrl").replace(/opt|option/, "alt").split("+").map(shorterKeyName).sort(keySorter).join("+");
  }
  function readableHotkey(hotkey) {
    return normalizeHotkey(hotkey).replace(/meta/, platform() === "darwin" ? "cmd" : "win").split("+").map(capitalize).join("+");
  }
  function shorterModifierName(key) {
    return key.slice(0, -3);
  }
  function shorterKeyName(key) {
    return arrowKeys[key] ?? key;
  }
  function keySorter(a, b) {
    return (modifiersWeights[a] ?? maxModifiersWeights) - (modifiersWeights[b] ?? maxModifiersWeights);
  }

  // vendor/workspace_core/src/command/command-manager.ts
  var CommandManager = class {
    constructor(app = useEventBus("app"), logger = useService("logger", ["CommandManager"]), config = useService("config-repository"), hotkeyManager = useService("hotkey-manager")) {
      this.logger = logger;
      this.config = config;
      this.hotkeyManager = hotkeyManager;
      app.on("load", () => this.loadConfig());
    }
    defaultCommandMap = {};
    commandMap = {};
    disposableMap = {};
    register(command) {
      if (command.id in this.defaultCommandMap) {
        this.logger.error(`command ${command.id} already registered`);
      }
      if (command.showInCommandPanel == null) {
        command.showInCommandPanel = true;
      }
      this.defaultCommandMap[command.id] = command;
      this.commandMap[command.id] = Object.create(command);
      this.disposableMap[command.id] = [];
      if (command.hotkey) {
        command.hotkey = readableHotkey(command.hotkey);
        this.bindHotkey(command);
      }
      return () => this.unregister(command);
    }
    unregister(command) {
      this.unbindHotkey(this.commandMap[command.id]);
      delete this.commandMap[command.id];
      delete this.defaultCommandMap[command.id];
    }
    bindHotkey(command) {
      if (!command.hotkey) {
        this.unbindHotkey(command);
        return;
      }
      const disposes = this.disposableMap[command.id] = [];
      disposes.push(
        command.scope === "global" ? this.hotkeyManager.addHotkey(command.hotkey, command.callback) : this.hotkeyManager.addEditorHotkey(command.hotkey, command.callback)
      );
    }
    unbindHotkey(command) {
      this.disposableMap[command.id].forEach((fn) => fn());
      this.disposableMap[command.id] = [];
    }
    run(commandId, args = []) {
      try {
        this.commandMap[commandId]?.callback(...args);
      } catch (error) {
        this.logger.error(`run:${commandId}`, error);
      }
    }
    setCommandHotkey(commandId, hotkey) {
      const cmd = this.commandMap[commandId];
      if (this.defaultCommandMap[commandId].hotkey == hotkey) {
        delete cmd.hotkey;
      } else {
        cmd.hotkey = hotkey;
      }
      this.bindHotkey(cmd);
      this.saveConfig();
    }
    resetCommandHotkey(commandId) {
      this.unbindHotkey(this.commandMap[commandId]);
      this.setCommandHotkey(commandId, this.defaultCommandMap[commandId].hotkey);
    }
    loadConfig() {
      const map = this.config.readConfigJson("hotkeys");
      Object.keys(this.commandMap).forEach((id) => this.resetCommandHotkey(id));
      Object.keys(map).forEach((id) => this.setCommandHotkey(id, map[id].hotkey));
    }
    getConfig() {
      return Object.keys(this.commandMap).filter((id) => Object.keys(this.commandMap[id]).length).reduce((o, k) => (o[k] = this.commandMap[k], o), {});
    }
    saveConfig() {
      this.config.writeConfigJson("hotkeys", this.getConfig());
    }
  };
  __decorateClass([
    debounced(1e3)
  ], CommandManager.prototype, "saveConfig", 1);

  // vendor/workspace_core/src/io/config-repository.ts
  var ConfigRepository = class {
    configDir = globalConfigDir();
    dataDir = this.configDir + "/data";
    isUsingGlobalConfig = true;
    readConfigJson(filename, fallback = {}) {
      try {
        return JSON.parse(reqnode("fs").readFileSync(reqnode("path").join(this.configDir, filename + ".json"), "utf8"));
      } catch {
        return fallback;
      }
    }
    writeConfigJson(filename, value) {
      const fs2 = reqnode("fs"), path2 = reqnode("path");
      const target = path2.join(this.configDir, filename + ".json");
      const contents = JSON.stringify(value, null, 2);
      fs2.mkdirSync(this.configDir, { recursive: true });
      const temporary = target + "." + reqnode("crypto").randomBytes(12).toString("hex") + ".tmp";
      let descriptor, created = false;
      try {
        descriptor = fs2.openSync(temporary, "wx");
        created = true;
        fs2.writeFileSync(descriptor, contents, "utf8");
        fs2.fsyncSync(descriptor);
        fs2.closeSync(descriptor);
        descriptor = void 0;
        fs2.renameSync(temporary, target);
        created = false;
      } finally {
        if (descriptor !== void 0) try {
          fs2.closeSync(descriptor);
        } catch {
        }
        if (created) try {
          fs2.unlinkSync(temporary);
        } catch {
        }
      }
    }
  };

  // vendor/workspace_core/src/io/vault.ts
  var Vault = class extends Events {
    constructor(app = useEventBus("app"), logger = useService("logger", ["Vault"])) {
      super("vault");
      this.logger = logger;
      app.once("load", () => this._emitMissingEvents());
      this._registerEventHooks();
    }
    _path = File.getMountFolder() ?? _options.mountFolder ?? path_default.dirname(_options.initFilePath ?? File.filePath ?? File.bundle.filePath);
    get id() {
      return hashCode(this.path);
    }
    get path() {
      return this._path;
    }
    _emitMissingEvents() {
      if (this.path) {
        this.emit("mounted", this.path);
      }
    }
    _registerEventHooks() {
      decorate.afterCall(File, "setMountFolder", () => {
        const folder = File.getMountFolder();
        if (this._path !== folder) {
          this._path = folder;
          this.emit("mounted", folder);
          this.emit("change", folder);
        }
      });
      const renamingFiles = /* @__PURE__ */ new Set();
      File.isNode ? (decorate.afterCall(JSBridge, "invoke", async (args) => {
        if ("app.sendEvent" === args[0] && "didRename" === args[1]) {
          const { oldPath, newPath } = args[2];
          const type = await filesystem_default.isDirectory(newPath) ? "directory" : "file";
          renamingFiles.add(oldPath);
          this.emit(`${type}:rename`, oldPath, newPath);
          setTimeout(() => renamingFiles.delete(oldPath), 333);
        }
      }), decorate.afterCall(editor.library.fileTree, "onRemoveFile", ([file]) => {
        if (typeof file === "string" && !renamingFiles.has(file)) {
          this.emit("file:delete", file);
        }
      })) : decorate.afterCall(editor.library, "onFileChanges", ([events]) => {
        events.forEach((event) => {
          if (event.type === "rename") {
            const type = event.isDir ? "directory" : "file";
            this.emit(`${type}:rename`, event.oldPath, event.newPath);
          } else if (event.type === "removed") {
            this.emit("file:delete", event.path);
          }
          return [event];
        });
      });
    }
  };
  function hashCode(s) {
    return (s.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0) | 0, 0) + 2147483648).toString(16);
  }

  // vendor/workspace_core/src/locales/i18n.ts
  var DEFAULT_OPTIONS = {
    defaultLang: "en"
  };
  var I18n = class {
    constructor(options, logger = useService("logger", ["I18n"])) {
      this.logger = logger;
      const {
        defaultLang,
        userLang,
        localePath,
        resources
      } = Object.assign({}, DEFAULT_OPTIONS, options);
      const locale = (userLang ?? _options.appLocale ?? _options.locale).toLowerCase();
      const localeList = [locale, locale.split("-").at(0), defaultLang];
      if (resources) {
        this.loadFormJson(localeList, resources);
        return;
      }
      this.loadFormFile(localeList, localePath);
    }
    locale;
    resources;
    get t() {
      return this.resources;
    }
    loadFormJson(localeList, resources) {
      this.locale = localeList.find((s) => resources[s]) ?? "";
      this.resources = resources[this.locale];
    }
    loadFormFile(localeList, localePath) {
      const pathList = localeList.map((s) => path_default.join(localePath, `lang.${s}.json`));
      for (let i = 0; i < pathList.length; i++) {
        try {
          const localePath2 = pathList[i];
          const localeText = filesystem_default.readTextSync(localePath2);
          this.locale = localeList[i];
          this.resources = JSON.parse(localeText);
          return;
        } catch (error) {
          this.logger.warn(`Failed to load locale file: lang.${localeList[i]}.json`);
          continue;
        }
      }
      throw new Error("No locale file found.");
    }
  };

  // vendor/workspace_core/src/settings/settings.ts
  var Settings = class extends Store {
    constructor(options, logger = useService("logger", ["Settings"]), config = useService("config-repository")) {
      super();
      this.logger = logger;
      this.config = config;
      this.filename = options.filename;
      this._codeVersion = options.version;
      this._fileVersion = options.version;
      this._migrations = options.migrations;
      this._data = Object.create(this._defaultSettings);
      this.addChangeListener("*", () => {
        if (!this._is_saving_immediately) this.save();
      });
      this.load();
    }
    _settingsDir;
    get _isSettingsLoaded() {
      return this._settingsDir === this.config.configDir;
    }
    filename;
    get version() {
      return this._fileVersion;
    }
    _codeVersion = 0;
    _fileVersion = 0;
    _defaultSettings = {};
    _migrations;
    _is_saving_immediately = false;
    setDefault(settings) {
      Object.assign(this._defaultSettings, settings);
    }
    /** 显式设置表单先落盘，再发布内存更新；失败不覆盖当前设置。 */
    set_and_save(key, value) {
      if (typeof key !== "string") throw new TypeError("Setting key must be a string.");
      const settings = { ...this._data, [key]: value };
      this.config.writeConfigJson(this.filename, { version: this._fileVersion, settings });
      this._is_saving_immediately = true;
      try {
        this.set(key, value);
      } finally {
        this._is_saving_immediately = false;
      }
    }
    load() {
      if (this._isSettingsLoaded) {
        return;
      } else {
        this._settingsDir = this.config.configDir;
      }
      const oldSettings = this._data;
      const rawStores = this.config.readConfigJson(this.filename, {
        version: this._codeVersion,
        settings: {}
      });
      this._fileVersion = rawStores.version;
      this._data = Object.assign(
        Object.create(this._defaultSettings),
        rawStores.settings
      );
      Object.keys(this._defaultSettings).forEach((key) => {
        if (this._data[key] === oldSettings[key]) return;
        this._emit(key, this._data[key]);
      });
      if (this._fileVersion < this._codeVersion) {
        this._migrations?.migrate(this);
        if (this._migrations?.hasMigrated) {
          this.save();
          this._migrations.hasMigrated = false;
        }
      }
    }
    save() {
      this.logger.debug(`Saving settings to ${this.filename}.json`);
      this.config.writeConfigJson(this.filename, { version: this._fileVersion, settings: this._data });
    }
    migrateTo(newVersion, transform) {
      const result = transform({ version: this._fileVersion, settings: this._data });
      this._fileVersion = newVersion;
      this._data = result.settings;
    }
  };
  __decorateClass([
    debounced(1e3)
  ], Settings.prototype, "save", 1);

  // vendor/workspace_core/src/ui/view-manager.ts
  var ViewManager = class {
    viewByType = {};
    typeByExtension = {};
    registerViewWithExtensions(extensions, type, viewFactory) {
      this.registerExtensions(extensions, type);
      this.registerView(type, viewFactory);
      return () => {
        this.unregisterExtensions(extensions);
        this.unregisterView(type);
      };
    }
    registerExtensions(extensions, type) {
      extensions.forEach((ext) => {
        this.registerExtension(ext, type);
      });
      return () => this.unregisterExtensions(extensions);
    }
    registerExtension(extension, type) {
      this.typeByExtension[extension] = type;
      return () => this.unregisterExtension(extension);
    }
    unregisterExtensions(extensions) {
      extensions.forEach((ext) => {
        this.unregisterExtension(ext);
      });
    }
    unregisterExtension(extension) {
      delete this.typeByExtension[extension];
    }
    isExtensionRegistered(extension) {
      return !!this.getTypeByExtension(extension);
    }
    registerView(type, viewFactory) {
      if (false) {
        this.viewByType[type] = (leaf, state) => {
          const view = viewFactory(leaf, state);
          return wrapWithLoggingProxy2(view, type, useService2("logger", [type]), {
            args: true,
            entry: true,
            exit: true,
            errors: true,
            perf: false
          });
        };
      } else {
        this.viewByType[type] = viewFactory;
      }
      return () => this.unregisterView(type);
    }
    unregisterView(type) {
      delete this.viewByType[type];
    }
    getTypeByExtension(extension) {
      return this.typeByExtension[extension];
    }
    getViewCreatorByType(type) {
      return this.viewByType[type];
    }
  };

  // vendor/workspace_core/src/ui/common/view-legacy.ts
  var ViewLegacy = class extends Component {
    containerEl;
    show() {
      this.containerEl.style.display = "block";
    }
    hide() {
      this.containerEl.style.display = "none";
    }
  };

  // vendor/workspace_core/src/ui/sidebar/sidebar.ts
  var Sidebar = class extends Component {
    constructor(internalPanels, ribbon = useService("ribbon")) {
      super();
      this.ribbon = ribbon;
      setTimeout(() => {
        this.internalPanels = internalPanels();
        this.internalPanels.forEach((view) => this.addPanel(view));
      }, 1);
    }
    container = new SidebarContainer();
    activePanel;
    internalPanels = [];
    panels = [];
    addPanel(panel) {
      super.addChild(panel);
      if (panel instanceof ViewLegacy) {
        panel.load();
        this.container.addPanel(panel);
      }
      if (panel.ribbonButton) {
        this.ribbon.addButton(panel.ribbonButton);
      }
      this.panels.push(panel);
      return () => this.removePanel(panel);
    }
    /**
     * Use `addPanel` instead.
     * @deprecated compatible with old api (<=2.2.22)
     */
    addChild(panel) {
      return this.addPanel(panel);
    }
    removePanel(panel) {
      if (panel.ribbonButton) {
        this.ribbon.removeButton(panel.ribbonButton);
      }
      this.panels = this.panels.filter((v) => v !== panel);
      if (panel instanceof ViewLegacy) {
        panel.unload();
        this.container.removePanel(panel);
      }
    }
    /**
     * Use `removePanel` instead.
     * @deprecated compatible with old api (<=2.2.22)
     */
    removeChild(panel) {
      this.removePanel(panel);
    }
    get isShown() {
      return editor.library.isSidebarShown();
    }
    switch(viewClass) {
      if (this.activePanel instanceof viewClass) {
        this.toggle();
        return;
      }
      Object.values(this.internalPanels).forEach((v) => v.hide());
      this.hide();
      this.activePanel = this.panels.find((c) => c instanceof viewClass);
      this.show();
    }
    toggle() {
      this.isShown ? this.hide() : this.show();
    }
    show() {
      editor.library.showSidebar();
      this.activePanel?.show();
    }
    hide() {
      editor.library.hideSidebar();
      this.activePanel?.hide();
    }
  };
  var SidebarContainer = class extends View {
    wrapperEl;
    constructor() {
      super();
      this.containerEl = document.getElementById("sidebar-content");
      this.wrapperEl = this.containerEl.parentElement;
    }
    addPanel(panel) {
      this.containerEl.append(panel.containerEl);
    }
    removePanel(panel) {
      panel.containerEl.remove();
    }
  };

  // vendor/workspace_core/src/ui/sidebar/outline.ts
  var Outline = class extends InternalSidebarPanel {
    constructor(i18n = useService("i18n")) {
      super();
      this.containerEl = document.getElementById("outline-content");
      this.addRibbonButton({
        [BUILT_IN]: true,
        id: "core.outline",
        title: i18n.t.ribbon.outline,
        icon: html`<i class="fa fa-list typ-lighter-icon"></i>`
      });
    }
    onshow() {
      editor.library.switch("outline");
      this.containerEl.style.display = "block";
    }
    onhide() {
      this.containerEl.parentElement.classList.remove("active-tab-outline");
      this.containerEl.style.display = "none";
    }
  };

  // vendor/workspace_core/src/ui/components/modal.ts
  var Modal = class extends View {
    modal;
    header;
    body;
    footer;
    closeListeners = [];
    constructor(props) {
      super();
      this.containerEl = $('<div class="typ-modal__wrapper middle stopselect" style="display: none;"></div>').on("click", (event) => {
        if (event.target !== this.containerEl) return;
        this.close();
      }).on("keyup", (event) => {
        if (event.key !== "Escape") return;
        this.close();
      }).append(
        this.modal = $(`<div class="typ-modal ${props.className ?? ""}"></div>`).append(
          this.body = html`<div class="typ-modal__body"></div>`
        ).get(0)
      ).get(0);
      document.body.append(this.containerEl);
    }
    setHeader(text) {
      if (!this.header) {
        this.header = html`<div class="typ-modal__header">${text}</div>`;
        this.modal.prepend(this.header);
      } else {
        this.header.textContent = text;
      }
      return this;
    }
    setBody(build) {
      build(this.body);
      return this;
    }
    setFooter(build) {
      if (!this.footer) {
        this.footer = html`<div class="typ-modal__footer"></div>`;
        this.modal.append(this.footer);
      } else {
        this.footer.innerHTML = "";
      }
      build(this.footer);
      return this;
    }
    onClose(callback) {
      this.closeListeners.push(callback);
      return this;
    }
    open() {
      this.containerEl.style.display = "";
    }
    close() {
      this.closeListeners.forEach((callback) => callback());
      this.containerEl.style.display = "none";
      $("input", this.containerEl).each((i, el) => el.blur());
    }
  };

  // vendor/workspace_core/src/ui/components/quick-open.ts
  globalThis.openInputBox = openInputBox;
  globalThis.openQuickPick = openQuickPick;
  function openInputBox(options) {
    const inputBox = useService("input-box");
    return new Promise((resolve) => {
      inputBox.open(resolve, options);
    });
  }
  function openQuickPick(items, options) {
    const quickPick = useService("quick-pick");
    return new Promise((resolve) => {
      quickPick.open(resolve, items, options);
    });
  }
  var InputBox = class extends Component {
    constructor(markdownEditor = useService("markdown-editor")) {
      super();
      this.markdownEditor = markdownEditor;
    }
    modal;
    input;
    options;
    resolve;
    resolved = false;
    onload() {
      this.render();
      super.onload();
    }
    open(resolve, options = {}) {
      this.resolve = resolve;
      this.resolved = false;
      this.options = options;
      $(this.modal.containerEl).find(".typ-command-modal__title").text(options.title ?? "").end().find(".typ-command-modal__form input").attr("placeholder", this.options.placeholder ?? "").end().find(".typ-command-modal__prompt").text(options.prompt ?? "");
      this.modal.open();
      this.markdownEditor.selection.save();
      this.input.focus();
    }
    close() {
      if (!this.resolved) {
        this.resolve(void 0);
      }
      this.resolve = void 0;
      this.input.value = "";
      this.markdownEditor.selection.restore();
    }
    render() {
      this.modal = new Modal({ className: "typ-command-modal" }).onClose(() => this.close()).setBody((body) => {
        $(body).on("keyup", this.onKeyup).append(
          html`<div class="typ-command-modal__title"></div>`,
          $('<div class="typ-command-modal__form"></div>').append(this.input = html`<input type="text" />`),
          html`<div class="typ-command-modal__prompt"></div>`
        );
      });
    }
    onKeyup = (e) => {
      switch (e.key) {
        case "Enter":
          this.resolve(this.input.value);
          this.resolved = true;
          this.close();
          this.modal.close();
          break;
      }
    };
  };
  var QuickPick = class extends Component {
    constructor(markdownEditor = useService("markdown-editor")) {
      super();
      this.markdownEditor = markdownEditor;
    }
    modal;
    input;
    results;
    items = [];
    filteredItems = [];
    selected = -1;
    picked = {};
    options;
    resolve;
    resolved = false;
    onload() {
      this.render();
      super.onload();
    }
    open(resolve, items, options = {}) {
      this.items = items;
      this.options = options;
      this.resolve = resolve;
      this.resolved = false;
      $(this.modal.containerEl).find(".typ-command-modal__title").text(options.title ?? "").end().find(".typ-command-modal__form input").attr("placeholder", options.placeholder ?? "").end().find(".typ-command-modal__form button").css("display", options.canPickMany ? "" : "none");
      this.filteredItems = items;
      this.renderItems();
      this.modal.open();
      this.markdownEditor.selection.save();
      this.input.focus();
    }
    closePickMany() {
      const res = Object.values(this.picked);
      this.resolve(res.length ? res : void 0);
      this.resolved = true;
      this.close();
      this.modal.close();
    }
    close() {
      if (!this.resolved) {
        this.resolve(void 0);
      }
      this.items = [];
      this.resolve = void 0;
      this.input.value = "";
      this.selected = -1;
      this.picked = {};
      this.markdownEditor.selection.restore();
    }
    render() {
      this.modal = new Modal({ className: "typ-command-modal" }).onClose(() => this.close()).setBody((body) => {
        $(body).on("keyup", this.onKeyup).append(
          html`<div class="typ-command-modal__title"></div>`,
          $('<div class="typ-command-modal__form"></div>').append(
            this.input = html`<input type="text" />`,
            $(`<button class="typ-button primary">OK</button>`).on("click", () => this.closePickMany())
          )
        ).append(
          this.results = $('<div class="typ-command-modal__results stopselect"></div>').on("click", this.onItemClick).get(0)
        );
      });
    }
    onKeyup = (event) => {
      let { key } = event;
      if (key.startsWith("Arrow")) {
        if (key === "ArrowDown") {
          if (this.selected < this.filteredItems.length - 1) {
            this.selected++;
          } else {
            this.selected = 0;
          }
        } else if (key === "ArrowUp") {
          if (this.selected > 0) {
            this.selected--;
          } else {
            this.selected = this.filteredItems.length - 1;
          }
        }
        this.renderItems();
        return;
      }
      if (key === "Enter") {
        this.onSelect(this.selected);
        return;
      }
      this.selected = -1;
      this.filteredItems = this.items.filter(
        (c) => c.label.toLowerCase().includes(this.input.value.toLowerCase())
      );
      this.renderItems();
    };
    renderItems() {
      this.results.innerHTML = "";
      this.results.append(...this.filteredItems.map((item, i) => {
        const active = i === this.selected ? "active" : "";
        return $(`<div class="typ-command-modal__item ${active}" data-index=${i}>${item.label}</div>`).prepend(this.options.canPickMany ? `<input type="checkbox" ${this.picked[i] ? "checked" : ""}> ` : "").get(0);
      }));
    }
    onItemClick = (event) => {
      const el = event.target;
      const item = el.closest(".typ-command-modal__item");
      if (!item) return;
      this.onSelect(+item.dataset.index);
    };
    onSelect = (index) => {
      if (this.options.canPickMany) {
        $(this.modal.containerEl).find(".typ-command-modal__item input").eq(index).prop("checked", !this.picked[index]);
        if (this.picked[index]) {
          delete this.picked[index];
        } else {
          this.picked[index] = this.filteredItems[index];
        }
        return;
      }
      this.resolve(this.filteredItems[index]);
      this.resolved = true;
      this.close();
      this.modal.close();
    };
  };

  // vendor/workspace_core/src/ui/commands/command-modal.ts
  var CommandModal = class extends Component {
    constructor(i18n = useService("i18n"), commandsMgr = useService("command-manager")) {
      super();
      this.i18n = i18n;
      this.commandsMgr = commandsMgr;
    }
    onload() {
      const t = this.i18n.t.commandModal;
      this.register(
        this.commandsMgr.register({
          id: "command:open",
          title: t.commandOpen,
          scope: "global",
          hotkey: "F1",
          showInCommandPanel: false,
          callback: () => {
            const commands = Object.values(this.commandsMgr.commandMap).filter((c) => c.showInCommandPanel).map((c) => ({
              id: c.id,
              label: c.title
            }));
            openQuickPick(commands, { placeholder: t.placeholder }).then((cmd) => cmd && this.commandsMgr.run(cmd.id));
          }
        })
      );
    }
  };

  // vendor/workspace_core/src/ui/quick-open-panel.ts
  var QuickOpenPanel = class extends Component {
    _ignoreFile;
    _quickOpenInCurrentWin;
    constructor() {
      super();
      setTimeout(() => {
        this._ignoreFile = new IgnoreFile();
        this._quickOpenInCurrentWin = new QuickOpenInCurrentWin();
      });
    }
  };
  var IgnoreFile = class extends Component {
    constructor(vault = useService("vault"), settings = useService("settings")) {
      super();
      this.vault = vault;
      this.settings = settings;
      const SETTING_KEY = "ignoreFile";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    _ignoredFiles = [];
    onload() {
      this._buildIgnoredFiles(this.settings.get("ignoreFileGlob"));
      this.register(
        this.settings.onChange(
          "ignoreFileGlob",
          (_, glob) => this._buildIgnoredFiles(glob)
        )
      );
      this._removeIgnoredFiles();
      this.register(
        decorate.afterCall(editor.quickOpenPanel, "initFileCache", () => {
          this._removeIgnoredFiles();
        })
      );
      this.register(
        decorate.parameters(editor.quickOpenPanel, "addInitFiles", (args) => {
          const [filePaths, fileNames, modifiedDates] = args;
          for (let i = 0; i < filePaths.length; i++) {
            const file = filePaths[i];
            if (this._ignoredFiles.some((p) => file.startsWith(p))) {
              filePaths[i] = null;
              fileNames[i] = null;
              modifiedDates[i] = null;
            }
          }
          for (let i = 0; i < args.length; i++) {
            args[i] = args[i].filter((o) => o);
          }
          return args;
        })
      );
    }
    onunload() {
      editor.quickOpenPanel.cacheFolder(this.vault.path);
    }
    _buildIgnoredFiles(glob) {
      this._ignoredFiles = glob.split(",").map((folder) => path_default.join(this.vault.path, folder));
    }
    _removeIgnoredFiles() {
      this._ignoredFiles.forEach((folder) => editor.quickOpenPanel.removeInitFiles(folder));
    }
  };
  var QuickOpenInCurrentWin = class extends Component {
    constructor(settings = useService("settings")) {
      super();
      const SETTING_KEY = "quickOpenInCurrentWin";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    onload() {
      this.register(
        decorate(JSBridge, "invoke", (fn) => async (...args) => {
          if (args[0] === "app.openFileOrFolder" && (await filesystem_default.stat(args[1])).isFile() && !args[2].forceCreateWindow) {
            editor.library.openFile(args[1]);
            editor.library.refreshPanelCommand();
            return;
          }
          return fn(...args);
        })
      );
    }
  };

  // vendor/workspace_core/src/ui/layout/workspace-node.ts
  var WorkspaceNode = class extends Events {
    parent = null;
    containerEl;
    resizeHandleEl;
    constructor() {
      super();
      this.containerEl = $('<div class="typ-workspace-node">').append(this.resizeHandleEl = $('<hr class="typ-workspace-leaf-resize-handle">').on("mousedown", (e) => this.onResizeStart(e.originalEvent))[0])[0];
    }
    closest(type) {
      let node = this;
      while (node != null && node.type !== type) node = node.parent;
      return node;
    }
    setParent(parent) {
      this.parent = parent;
    }
    getRoot() {
      return useService("workspace").rootSplit;
    }
    detach() {
      this.parent?.removeChild(this);
    }
    onResizeStart(event) {
      if (event.button === 0 && this.parent?.type === "split") {
        this.parent.onChildResizeStart(this, event);
      }
    }
  };

  // vendor/workspace_core/src/ui/layout/workspace-parent.ts
  var WorkspaceParent = class extends WorkspaceNode {
    children = [];
    isLeaf() {
      return false;
    }
    // --------- Child Node Operators ---------
    appendChild(child) {
      this.insertChild(this.children.length, child);
    }
    insertBefore(child) {
      const index = this.children.findIndex((c) => c === child);
      this.insertChild(index, child);
    }
    insertChild(index, child) {
      this._insertChild(index, child);
      this.getRoot().emit("layout-changed");
    }
    _insertChild(index, child) {
      this.children.splice(index, 0, child);
      child.setParent(this);
      this._insertChildEl(index, child);
    }
    replaceChild(oldChild, newChild) {
      const index = this.children.findIndex((c) => c === oldChild);
      this._removeChild(oldChild);
      this._insertChild(index, newChild);
      this.getRoot().emit("layout-changed");
    }
    removeChild(child) {
      this._removeChild(child);
      this.getRoot().emit("layout-changed");
    }
    _removeChild(child) {
      const index = this.children.findIndex((c) => c === child);
      this.children.splice(index, 1);
      child.setParent(null);
      child.containerEl.remove();
    }
    // --------- Iteration Operators ---------
    eachNodes(iteratee) {
      const nodes = this.children;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (iteratee(node)) break;
        if (node.type !== "leaf") {
          node.eachNodes(iteratee);
        }
      }
    }
    findNode(iteratee) {
      let res = null;
      this.eachNodes((node) => {
        if (iteratee(node)) {
          res = node;
          return true;
        }
      });
      return res;
    }
    filterNodes(iteratee) {
      const res = [];
      this.eachNodes((node) => {
        if (iteratee(node)) res.push(node);
      });
      return res;
    }
    eachLeaves(iteratee) {
      const nodes = this.children;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.type === "leaf") {
          if (iteratee(node)) break;
        } else {
          node.eachLeaves(iteratee);
        }
      }
    }
    findLeaf(iteratee) {
      let res = null;
      this.eachLeaves((leaf) => {
        if (iteratee(leaf)) {
          res = leaf;
          return true;
        }
      });
      return res;
    }
    filterLeaves(iteratee) {
      const res = [];
      this.eachLeaves((leaf) => {
        if (iteratee(leaf)) res.push(leaf);
      });
      return res;
    }
    toJSON() {
      return {
        type: this.type,
        children: this.children.map((c) => c.toJSON())
      };
    }
  };

  // vendor/workspace_core/src/ui/layout/split/index.ts
  var WorkspaceSplit = class extends WorkspaceParent {
    constructor(direction) {
      super();
      this.direction = direction;
      $(this.containerEl).addClass("typ-workspace-split");
      this.setDirection(direction);
    }
    type = "split";
    sizes = [];
    setDirection(direction) {
      this.direction = direction;
      $(this.containerEl).removeClass(["mod-horizontal", "mod-vertical"]).addClass(`mod-${direction}`);
    }
    insertChild(index, child) {
      const prevChild = this.children[index - 1] ?? this.children[index];
      const prevSizeIdx = this.children.findIndex((c) => c === prevChild);
      super.insertChild(index, child);
      if (this.children.length === 1) {
        this.sizes.push(1);
      } else {
        const avgWidth = this.sizes[prevSizeIdx] / 2;
        this.sizes[prevSizeIdx] = avgWidth;
        this.sizes.splice(index, 0, avgWidth);
      }
      this.updatePaneSizes();
    }
    _insertChildEl(index, child) {
      this.containerEl.insertBefore(child.containerEl, this.containerEl.children[index + 1]);
    }
    removeChild(child) {
      super.removeChild(child);
      const idx = this.children.findIndex((c) => c === child);
      const [leftWidth] = this.sizes.splice(idx, 1);
      if (this.children.length) {
        const avgWidth = leftWidth / this.children.length;
        this.sizes = this.sizes.map((s) => s + avgWidth);
        this.updatePaneSizes();
      }
      if (this.children.length === 1) {
        this.parent?.replaceChild(this, this.children[0]);
      }
    }
    onChildResizeStart(child, e) {
      let dragging = true;
      const isVertical = this.direction === "vertical";
      const splits = this.children;
      const idx = false ? splits.findIndex((c) => c.containerEl === child.containerEl) : splits.findIndex((c) => c === child);
      if (idx <= 0) return;
      const leftIdx = idx - 1;
      const containerRect = this.containerEl.getBoundingClientRect();
      const totalPixel = isVertical ? containerRect.width : containerRect.height;
      const leftDom = splits[leftIdx].containerEl;
      const rightDom = splits[idx].containerEl;
      const leftW = isVertical ? leftDom.offsetWidth : leftDom.offsetHeight;
      const rightW = isVertical ? rightDom.offsetWidth : rightDom.offsetHeight;
      const startPos = isVertical ? e.clientX : e.clientY;
      document.onmousemove = (e2) => {
        if (!dragging) return;
        const curPos = isVertical ? e2.clientX : e2.clientY;
        const deltaPx = curPos - startPos;
        let newLeftPx = Math.max(120, leftW + deltaPx);
        let newRightPx = Math.max(120, rightW - deltaPx);
        if (newLeftPx + newRightPx > totalPixel) {
          newRightPx = totalPixel - newLeftPx;
        }
        const newLeftSize = newLeftPx / totalPixel;
        const newRightSize = newRightPx / totalPixel;
        this.sizes[leftIdx] = newLeftSize;
        this.sizes[idx] = newRightSize;
        const remain = 1 - (newLeftSize + newRightSize);
        const otherIdx = this.sizes.map((v, index) => index === leftIdx || index === idx ? -1 : index).filter((i) => i !== -1);
        if (otherIdx.length > 0) {
          const fact = remain / otherIdx.length;
          otherIdx.forEach((i) => this.sizes[i] = fact);
        }
        this.updatePaneSizes();
      };
      document.onmouseup = () => {
        dragging = false;
        document.onmousemove = document.onmouseup = null;
      };
    }
    updatePaneSizes() {
      this.children.forEach((child, i) => {
        const dom = child.containerEl;
        dom.style.flex = "0 0 auto";
        if (this.direction === "vertical") {
          dom.style.flexBasis = this.sizes[i] * 100 + "%";
        } else {
          dom.style.flexBasis = this.sizes[i] * 100 + "%";
        }
      });
    }
  };

  // vendor/workspace_core/src/ui/layout/tabs/draggable.ts
  var TAB_DRAG_MIME = "application/x-typora-code-tab";
  var TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  function draggableTabs(root, workspace = useService("workspace")) {
    const root_el = root.containerEl, doc = root_el.ownerDocument, view = doc.defaultView;
    const marker = create_drop_marker(doc), events = new AbortController();
    let local, disposed = false, blocked_start = false;
    let scroll_frame = 0, scroll_header, last_over;
    const has_transfer = (event) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes(TAB_DRAG_MIME);
    const clear_feedback = () => {
      marker.hide();
      scroll_header = void 0;
      last_over = void 0;
      view.cancelAnimationFrame(scroll_frame);
      scroll_frame = 0;
    };
    const group_at = (element) => {
      const group_el = element?.closest(".typ-workspace-tabs");
      return group_el && root_el.contains(group_el) ? root.findNode((node) => node.containerEl === group_el) : null;
    };
    const valid_source = (drag) => drag.tab.isConnected && drag.source_group.containerEl.isConnected && drag.leaf.parent === drag.source_group && drag.leaf.state.path === drag.source_path;
    const end = (event, cancelled = false) => {
      const drag = local;
      local = void 0;
      clear_feedback();
      if (!drag) return;
      drag.tab.removeAttribute("data-workspace-drag-source");
      doc.dispatchEvent(new CustomEvent("typora-code:tab-drag-end", { detail: {
        leaf: drag.leaf,
        source_group: drag.source_group,
        transfer_token: drag.transfer_token,
        local_drop: drag.local_drop,
        cancelled: cancelled || drag.cancelled,
        drop_effect: event?.dataTransfer?.dropEffect || "none",
        screen_x: event?.screenX ?? 0,
        screen_y: event?.screenY ?? 0,
        client_x: event?.clientX ?? 0,
        client_y: event?.clientY ?? 0
      } }));
    };
    const resolve_target = (event) => {
      marker.hide();
      scroll_header = void 0;
      const element = doc.elementFromPoint(event.clientX, event.clientY);
      if (element?.closest(".typ-ribbon,#typora-sidebar,#top-titlebar,footer,.workspace-menu,.workspace-titlebar-menu-panel")) return;
      const group = group_at(element) || (element?.closest("content") ? root.findNode((node) => {
        if (node.type !== "tabs") return false;
        const box = node.containerEl.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      }) : null);
      if (!group || !group.containerEl.isConnected || local && !valid_source(local)) return;
      if (local && group !== local.source_group && group.children.some((node) => node.state.path === local.source_path)) return;
      const header = group.tabHeader.containerEl, header_box = header.getBoundingClientRect();
      const tabs = [...group.tabHeader.container.children].filter((node) => node instanceof HTMLElement && node !== local?.tab);
      if (event.clientY >= header_box.top && event.clientY <= header_box.bottom) {
        let index = tabs.findIndex((node) => event.clientX < node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2);
        if (index < 0) index = tabs.length;
        const x = tabs[index]?.getBoundingClientRect().left ?? tabs[index - 1]?.getBoundingClientRect().right ?? header_box.left;
        marker.show({ left: Math.max(header_box.left, Math.min(x, header_box.right - 2)), top: header_box.top, width: 2, height: header_box.height });
        scroll_header = header;
        return { group, index, header };
      }
      const body = group.tabContentEl.getBoundingClientRect();
      marker.highlight({ left: body.left, top: body.top, width: body.width, height: body.height });
      return { group, index: tabs.length };
    };
    const auto_scroll = () => {
      scroll_frame = 0;
      if (!last_over || disposed) return;
      if (scroll_header) {
        const box = scroll_header.getBoundingClientRect(), edge = 24;
        const direction = last_over.clientX < box.left + edge ? -1 : last_over.clientX > box.right - edge ? 1 : 0;
        if (direction) {
          const before = scroll_header.scrollLeft;
          scroll_header.scrollLeft += direction * 10;
          if (scroll_header.scrollLeft !== before) resolve_target(last_over);
        }
      }
      scroll_frame = view.requestAnimationFrame(auto_scroll);
    };
    const on_start = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const tab = element?.closest(".typ-tab"), source_group = group_at(tab || null);
      if (!tab || !source_group || tab.parentElement !== source_group.tabHeader.container) return;
      if (blocked_start || element?.closest(".typ-close,button,input,textarea,select,a") || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      const leaf = source_group.children.find((node) => node.state.path === tab.dataset.id);
      if (!leaf) {
        event.preventDefault();
        return;
      }
      end(void 0, true);
      cancel_pointer_drag(view, "native-tab-drag");
      const transfer_token = view.crypto.randomUUID();
      local = { leaf, source_group, tab, transfer_token, source_path: leaf.state.path, local_drop: false, cancelled: false };
      event.dataTransfer.clearData();
      event.dataTransfer.setData(TAB_DRAG_MIME, transfer_token);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setDragImage(tab, 0, 0);
      tab.dataset.workspaceDragSource = "true";
      event.stopImmediatePropagation();
      doc.dispatchEvent(new CustomEvent("typora-code:tab-drag-start", { detail: { leaf, source_group, transfer_token } }));
    };
    const on_over = (event) => {
      if (!has_transfer(event)) return;
      event.stopImmediatePropagation();
      if (local?.cancelled) {
        event.dataTransfer.dropEffect = "none";
        clear_feedback();
        return;
      }
      const target = resolve_target(event);
      event.dataTransfer.dropEffect = target ? "move" : "none";
      if (!target) {
        clear_feedback();
        return;
      }
      event.preventDefault();
      last_over = event;
      if (!scroll_frame) scroll_frame = view.requestAnimationFrame(auto_scroll);
    };
    const move_local = (drag, target) => {
      const { leaf, source_group, tab } = drag;
      drag.local_drop = true;
      if (source_group === target.group) {
        const old_index = source_group.children.indexOf(leaf);
        if (old_index < 0 || old_index === target.index) return;
        source_group.children.splice(old_index, 1);
        source_group.children.splice(target.index, 0, leaf);
        const tabs = [...source_group.tabHeader.container.children].filter((node) => node !== tab);
        source_group.tabHeader.container.insertBefore(tab, tabs[target.index] || null);
        const leaves = [...source_group.tabContentEl.children].filter((node) => node !== leaf.containerEl);
        source_group.tabContentEl.insertBefore(leaf.containerEl, leaves[target.index] || null);
        root.emit("layout-changed");
      } else {
        leaf.detach();
        target.group.insertChild(target.index, leaf);
        view.setTimeout(() => {
          if (leaf.parent === target.group && target.group.containerEl.isConnected) workspace.activeLeaf = leaf;
        });
      }
    };
    const on_drop = (event) => {
      if (!has_transfer(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = resolve_target(event), transfer_token = event.dataTransfer.getData(TAB_DRAG_MIME);
      clear_feedback();
      event.dataTransfer.dropEffect = "none";
      if (!target || !TOKEN_PATTERN.test(transfer_token) || local?.cancelled) return;
      if (local) {
        if (local.transfer_token !== transfer_token || !valid_source(local)) return;
        event.dataTransfer.dropEffect = "move";
        move_local(local, target);
        end(event);
      } else {
        const request = new CustomEvent("typora-code:tab-drop", { cancelable: true, detail: { transfer_token, target_group: target.group, target_index: target.index } });
        doc.dispatchEvent(request);
        if (request.defaultPrevented) event.dataTransfer.dropEffect = "move";
      }
    };
    const on_leave = (event) => {
      if (!has_transfer(event)) return;
      event.stopImmediatePropagation();
      if (!event.relatedTarget || !doc.documentElement.contains(event.relatedTarget)) clear_feedback();
    };
    const on_end = (event) => {
      if (!local) return;
      event.stopImmediatePropagation();
      end(event);
    };
    const on_escape = (event) => {
      if (event.key === "Escape" && local) {
        local.cancelled = true;
        end(void 0, true);
      }
    };
    const observer = new MutationObserver(() => {
      if (local && !local.local_drop && !valid_source(local)) end(void 0, true);
    });
    observer.observe(root_el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-id"] });
    root_el.addEventListener("pointerdown", (event) => {
      const element = event.target instanceof Element ? event.target : null;
      blocked_start = event.button !== 0 || !!element?.closest(".typ-close,button,input,textarea,select,a");
    }, { capture: true, signal: events.signal });
    doc.addEventListener("dragstart", on_start, { capture: true, signal: events.signal });
    doc.addEventListener("dragenter", on_over, { capture: true, signal: events.signal });
    doc.addEventListener("dragover", on_over, { capture: true, signal: events.signal });
    doc.addEventListener("drop", on_drop, { capture: true, signal: events.signal });
    doc.addEventListener("dragleave", on_leave, { capture: true, signal: events.signal });
    doc.addEventListener("dragend", on_end, { capture: true, signal: events.signal });
    doc.addEventListener("keydown", on_escape, { capture: true, signal: events.signal });
    view.addEventListener("pagehide", () => end(void 0, true), { signal: events.signal });
    return () => {
      if (disposed) return;
      disposed = true;
      end(void 0, true);
      observer.disconnect();
      events.abort();
      marker.dispose();
    };
  }

  // vendor/workspace_core/src/ui/layout/workspace-leaf.ts
  var WorkspaceLeaf = class extends WorkspaceNode {
    constructor(view, viewManager = useService("view-manager")) {
      super();
      this.viewManager = viewManager;
      this.containerEl.classList.add("typ-workspace-leaf");
      this.view = view;
    }
    type = "leaf";
    state = {};
    viewType;
    view;
    isLeaf() {
      return true;
    }
    setState(state) {
      const factory = this.viewManager.getViewCreatorByType(state.type);
      this.state = state.state ?? {};
      this.viewType = state.type;
      this.view = factory(this, state);
      this.containerEl.append(this.view.containerEl);
      return this;
    }
    toJSON() {
      return {
        type: "leaf",
        state: this.state
      };
    }
  };

  // vendor/workspace_core/src/ui/views/markdown-view/use-editing-tabs.ts
  var useEditingTabs = memorize(() => {
    let editingTabs = null;
    return {
      /**
       * @tips Cannot be used outside the Workspace API; otherwise, `null` will be returned after the Workspace is disabled.
       */
      editingTabs() {
        return editingTabs;
      },
      setEditingTabs(tabs) {
        editingTabs = tabs;
      },
      isEditingTabs(tabs) {
        return editingTabs === tabs;
      },
      isEditingSingleChildTabs() {
        return editingTabs?.children.length === 1;
      }
    };
  });

  // vendor/workspace_core/src/ui/views/markdown-view/md-editor-mode.ts
  var MdEditorMode = class _MdEditorMode {
    constructor(workspace = useService("workspace")) {
      this.workspace = workspace;
    }
    static getInstance = memorize(() => new _MdEditorMode());
    contentEl = editor.writingArea.parentElement;
    _parentTabs = null;
    _resizeObserver = null;
    handleSettingActiveLeaf = null;
    enter(ctx) {
      const { containerEl, leaf } = ctx;
      containerEl.classList.add("mode-typora");
      containerEl.innerHTML = '<object type="text/html" data="about:blank"></object>';
      const { setEditingTabs } = useEditingTabs();
      setEditingTabs(ctx.leaf.parent);
      this.contentEl.classList.add("typ-workspace-binding");
      this.contentEl.removeEventListener("mousedown", this.handleSettingActiveLeaf);
      this.contentEl.addEventListener("mousedown", this.handleSettingActiveLeaf = () => {
        this.workspace.activeLeaf = leaf;
      });
      this._parentTabs = leaf.parent;
      this.syncSize();
      this.unregisterObserver();
      this.registerObserver();
    }
    exit(ctx) {
      ctx.containerEl.classList.remove("mode-typora");
      ctx.containerEl.innerHTML = "";
      this.contentEl.classList.remove("typ-workspace-binding");
      this.contentEl.removeEventListener("mousedown", this.handleSettingActiveLeaf);
      this.unregisterObserver();
    }
    getScroll() {
      return { scrollTop: this.contentEl.scrollTop };
    }
    applyScroll(state) {
      this.contentEl.scrollTop = state.scrollTop;
    }
    registerObserver() {
      this._resizeObserver = new ResizeObserver(() => this.syncSize());
      if (this._parentTabs) {
        this._resizeObserver.observe(this._parentTabs.tabContentEl);
      }
    }
    unregisterObserver() {
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
    }
    syncSize() {
      const parent = this._parentTabs;
      if (!parent) return;
      const { style } = document.body;
      const targetEl = parent.tabContentEl;
      const rect = targetEl.getBoundingClientRect();
      style.setProperty("--typ-editor-top", rect.top + "px");
      style.setProperty("--typ-editor-left", rect.left + "px");
      style.setProperty("--typ-editor-width", rect.width + "px");
      style.setProperty("--typ-editor-height", rect.height + "px");
    }
  };

  // vendor/workspace_core/src/ui/views/markdown-view/md-previewer-mode.ts
  var MdPreviewerMode = class {
    constructor(mdRenderer = useService("markdown-renderer")) {
      this.mdRenderer = mdRenderer;
    }
    _containerEl = null;
    enter(ctx) {
      const { containerEl, filePath } = ctx;
      containerEl.classList.add("mode-previewer");
      this._containerEl = containerEl;
      filesystem_default.readText(filePath).then((md) => this.mdRenderer.renderTo(md, containerEl));
    }
    exit(ctx) {
      ctx.containerEl.classList.remove("mode-previewer");
      ctx.containerEl.innerHTML = "";
      this._containerEl = null;
    }
    getScroll() {
      return {
        scrollTop: this._containerEl?.parentElement.scrollTop ?? 0
      };
    }
    applyScroll(state) {
      if (this._containerEl)
        this._containerEl.parentElement.scrollTop = state.scrollTop;
    }
  };

  // vendor/workspace_core/src/ui/views/markdown-view/use-preview-tab-to-swap.ts
  var usePreviewTabToSwap = memorize(() => {
    let previewTabToSwap = null;
    return {
      beginSwap(leaf) {
        previewTabToSwap = leaf;
      },
      endSwap() {
        previewTabToSwap = null;
      },
      previewFileToSwap() {
        return previewTabToSwap?.state.path;
      },
      isPreviewFileToSwap(path2) {
        return previewTabToSwap?.state.path === path2;
      }
    };
  });

  // vendor/workspace_core/src/ui/views/markdown-view/use-record.ts
  var useRecord = memorize(() => {
    return {
      saveStateToLeaf(view) {
        view.leaf.state = { ...view.leaf.state, ...view.getState() };
      },
      restoreStateFromLeaf(view) {
        view.setState(view.leaf.state);
      }
    };
  });

  // vendor/workspace_core/src/ui/views/markdown-view/swap-command.ts
  var KEY_OPENFILE = Symbol.for("openFile$original");
  var SwapCommand = class extends Component {
    constructor(settings = useService("settings"), workspace = useService("workspace")) {
      super();
      this.settings = settings;
      this.workspace = workspace;
      const SETTING_KEY = "useAutoSwap";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    execute(editorLeaf, previewLeaf) {
      if (!this._loaded) return;
      const isSwappingSameFile = editorLeaf.state.path === previewLeaf.state.path;
      const previewView = previewLeaf.view;
      const writeEl = editor.writingArea.parentElement;
      const { saveStateToLeaf, restoreStateFromLeaf } = useRecord();
      const { beginSwap, endSwap } = usePreviewTabToSwap();
      saveStateToLeaf(editorLeaf.view);
      saveStateToLeaf(previewView);
      editorLeaf.view.setMode("previewer");
      beginSwap(previewLeaf);
      this._hideEditor(writeEl);
      this._setParent(previewLeaf);
      this._openFile(previewLeaf.state.path);
      const doSwap = () => {
        previewView.setMode("typora");
        this._syncEditorSize(previewView);
        this._showEditor(writeEl);
        setTimeout(() => {
          restoreStateFromLeaf(editorLeaf.view);
          restoreStateFromLeaf(previewView);
          endSwap();
        });
      };
      if (isSwappingSameFile) {
        doSwap();
      } else {
        this.workspace.once("file:open", doSwap);
      }
    }
    _hideEditor(writeEl) {
      writeEl.style.display = "none";
      writeEl.classList.remove("typ-deactive");
    }
    _setParent(previewLeaf) {
      const { setEditingTabs } = useEditingTabs();
      setEditingTabs(previewLeaf.parent);
    }
    _openFile(filePath) {
      editor.library[KEY_OPENFILE](filePath);
    }
    _syncEditorSize(previewView) {
      const mode = previewView._modeState;
      mode.syncSize();
    }
    _showEditor(writeEl) {
      writeEl.style.display = "";
    }
  };

  // vendor/workspace_core/src/ui/views/markdown-view/index.ts
  var KEY_OPENFILE2 = Symbol.for("openFile$original");
  var MarkdownView = class _MarkdownView extends WorkspaceView {
    constructor(leaf, workspace = useService("workspace"), mdEditor = useService("markdown-editor"), mdRenderer = useService("markdown-renderer")) {
      super(leaf);
      this.leaf = leaf;
      this.workspace = workspace;
      this.mdEditor = mdEditor;
      this.mdRenderer = mdRenderer;
    }
    static type = "core.markdown";
    /** @override */
    containerEl = $('<div class="typ-markdown-view"></div>')[0];
    _modeState = null;
    _swapCommand = new SwapCommand();
    get filePath() {
      return this.leaf.state.path;
    }
    get _modeCtx() {
      return {
        filePath: this.filePath,
        leaf: this.leaf,
        containerEl: this.containerEl
      };
    }
    /** @override */
    onload() {
      this.addChild(this._swapCommand);
      setTimeout(() => this.autoSetMode());
      this.register(
        this.leaf.getRoot().on("layout-changed", () => this.autoSetMode())
      );
      this.registerDomEvent(this.containerEl, "mousedown", (e) => {
        if (this.isEditor()) return;
        if (e.target.closest("a")) return;
        const { editingTabs } = useEditingTabs();
        const editorLeaf = editingTabs()?.findLeaf(
          (leaf) => leaf.viewType === _MarkdownView.type && leaf.view.isEditor()
        );
        if (!editorLeaf) return;
        this._swapCommand.execute(editorLeaf, this.leaf);
      });
    }
    isEditor() {
      return this._modeState instanceof MdEditorMode;
    }
    /** @override */
    getScroll() {
      return this._modeState?.getScroll() ?? super.getScroll();
    }
    /** @override */
    applyScroll(state) {
      this._modeState?.applyScroll(state);
    }
    /** @private */
    autoSetMode() {
      const { editingTabs, isEditingTabs } = useEditingTabs();
      if (!editingTabs() || isEditingTabs(this.leaf.parent)) {
        this.setMode("typora");
      } else {
        this.setMode("previewer");
      }
    }
    /** @override */
    onOpen() {
      this.autoSetMode();
      const doRestore = () => {
        const { restoreStateFromLeaf } = useRecord();
        restoreStateFromLeaf(this);
      };
      if (this.isEditor()) {
        editor.writingArea.parentElement.classList.remove("typ-deactive");
        editor.library[KEY_OPENFILE2](this.filePath);
        this.workspace.once("file:open", doRestore);
      } else {
        setTimeout(doRestore);
      }
    }
    /** @override */
    onClose() {
      const { saveStateToLeaf } = useRecord();
      saveStateToLeaf(this);
      if (this.isEditor()) {
        if (this.workspace.activeFile === this.filePath)
          editor.writingArea.parentElement.classList.add("typ-deactive");
        const { setEditingTabs, isEditingTabs, isEditingSingleChildTabs } = useEditingTabs();
        if (isEditingTabs(this.leaf.parent)) {
          this._modeState?.exit(this._modeCtx);
          this._modeState = null;
          if (isEditingSingleChildTabs()) {
            setEditingTabs(null);
            const nextMdLeaf = this.leaf.getRoot().findLeaf((leaf) => leaf.viewType === _MarkdownView.type && leaf !== this.leaf);
            if (nextMdLeaf) nextMdLeaf.parent.activeLeaf.view.onOpen();
          }
        } else {
          this._modeState = null;
        }
      } else {
        this._modeState?.exit(this._modeCtx);
        this._modeState = null;
      }
    }
    /** @private */
    setMode(mode) {
      const prevMode = this._modeState;
      if (prevMode instanceof MdEditorMode) {
        this._modeCtx.containerEl.classList.remove("mode-typora");
        this._modeCtx.containerEl.innerHTML = "";
      } else {
        prevMode?.exit(this._modeCtx);
      }
      this._modeState = mode === "typora" ? MdEditorMode.getInstance() : new MdPreviewerMode();
      this._modeState.enter(this._modeCtx);
      this.setIcon(mode === "typora" ? "fa-file-text-o" : "fa-file-text");
    }
    getState() {
      const state = this.getScroll();
      if (this.isEditor()) {
        state.cursorOffset = this.mdEditor.selection.getCursor();
      }
      return state;
    }
    setState(state) {
      requestAnimationFrame(() => {
        if (state.scrollTop != null) {
          this.applyScroll(state);
        }
        if (state.cursorOffset != null && this.isEditor()) {
          this.mdEditor.selection.setCursor(state.cursorOffset);
        }
      });
    }
    getCodeMirrorInstance(cid) {
      return this.isEditor() ? editor.fences.getCm(cid) : this.mdRenderer.getCodeMirrorInstance(cid);
    }
  };

  // vendor/workspace_core/src/ui/views/empty-view.ts
  var EmptyView = class extends WorkspaceView {
    constructor(leaf, settings = useService("settings")) {
      super(leaf);
      this.settings = settings;
    }
    static type = "core.empty";
    containerEl = html`<div></div>`;
    onload() {
      if (this.settings.get("useBlankNewTab")) return;
      $(this.containerEl).addClass("typ-empty-view").empty().append(html`<div><div class="typ-empty-title"></div><div class="typ-empty-hotkey"></div></div>`);
      setTimeout(() => {
        const config = useService("config-repository");
        const commands = useService("command-manager");
        const { t } = useService("i18n");
        const getHotky = (id) => commands.commandMap[id].hotkey?.split("+").map((k) => `<kbd>${k}</kbd>`).join("+") ?? "";
        $(this.containerEl).find(".typ-empty-title").text(t.views.empty.noFile).end().find(".typ-empty-hotkey").append(html`<dl><dt>${t.commandModal.commandOpen}</dt><dd>${getHotky("command:open")}</dd></dl>`).append(html`<dl><dt>${t.ribbon.settingOfApp}</dt><dd><kbd>Ctrl</kbd>+<kbd>,</kbd></dd></dl>`);
      });
    }
  };

  // vendor/workspace_core/src/ui/layout/floating/theme.ts
  function defaultTheme(containerEl) {
    containerEl.classList.add("typ-theme-default");
  }
  function windowTheme(containerEl, title) {
    containerEl.classList.add("typ-theme-window");
    const titleBar = document.createElement("div");
    titleBar.className = "typ-titlebar";
    const iconEl = document.createElement("span");
    iconEl.className = "typ-titlebar-icon";
    iconEl.innerHTML = '<i class="fa fa-window-maximize"></i>';
    const textEl = document.createElement("span");
    textEl.className = "typ-titlebar-text";
    textEl.textContent = title || "Floating View";
    titleBar.appendChild(iconEl);
    titleBar.appendChild(textEl);
    containerEl.prepend(titleBar);
  }

  // vendor/workspace_core/src/ui/layout/floating/resizable.ts
  function resizable(containerEl, options) {
    const minWidth = options?.minWidth ?? 120;
    const minHeight = options?.minHeight ?? 80;
    const handle = document.createElement("div");
    handle.className = "typ-floating-resize-handle";
    const prevPosition = getComputedStyle(containerEl).position;
    if (!["absolute", "fixed"].includes(prevPosition)) {
      containerEl.style.position = "relative";
    }
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    function onMouseMove(e) {
      const width = Math.max(minWidth, startWidth + e.clientX - startX);
      const height = Math.max(minHeight, startHeight + e.clientY - startY);
      containerEl.style.width = `${width}px`;
      containerEl.style.height = `${height}px`;
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    function onHandleMouseDown(e) {
      e.stopPropagation();
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startWidth = containerEl.offsetWidth;
      startHeight = containerEl.offsetHeight;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    handle.addEventListener("mousedown", onHandleMouseDown);
    containerEl.appendChild(handle);
    return () => {
      handle.removeEventListener("mousedown", onHandleMouseDown);
      handle.remove();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }

  // vendor/workspace_core/src/ui/layout/floating/draggable.ts
  function draggable2(containerEl, handleEl) {
    const handle = handleEl ?? containerEl;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    function onMouseMove(e) {
      containerEl.style.left = `${startLeft + e.clientX - startX}px`;
      containerEl.style.top = `${startTop + e.clientY - startY}px`;
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    function onHandleMouseDown(e) {
      if (e.button !== 0) return;
      const rect = containerEl.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      if (!containerEl.style.position || !["fixed", "absolute"].includes(containerEl.style.position)) {
        containerEl.style.position = "fixed";
      }
      containerEl.style.left = `${rect.left}px`;
      containerEl.style.top = `${rect.top}px`;
      containerEl.style.right = "";
      containerEl.style.bottom = "";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    handle.addEventListener("mousedown", onHandleMouseDown);
    return () => {
      handle.removeEventListener("mousedown", onHandleMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }

  // vendor/workspace_core/src/ui/layout/floating/closable.ts
  function closable(containerEl, onClose) {
    const closeBtn = document.createElement("div");
    closeBtn.className = "typ-floating-close";
    closeBtn.innerHTML = `<i class="typ-icon typ-close"></i>`;
    function onClick(e) {
      e.stopPropagation();
      onClose();
    }
    closeBtn.addEventListener("click", onClick);
    containerEl.appendChild(closeBtn);
    return () => {
      closeBtn.removeEventListener("click", onClick);
    };
  }

  // vendor/workspace_core/src/ui/layout/workspace-utils.ts
  function createUntitledTabs() {
    const tabs = useService("workspace-tabs");
    tabs.appendChild(createEditorLeaf(""));
    tabs.once("tab:toggle", () => tabs.removeTab(""));
    return tabs;
  }
  function createTabs(path2) {
    const workspace = useService("workspace");
    const tabs = useService("workspace-tabs");
    const newLeaf = path2 ? path2.startsWith("typ://") ? createCustomLeaf(path2) : createEditorLeaf(path2) : createEmptyLeaf();
    tabs.appendChild(newLeaf);
    workspace.activeLeaf = newLeaf;
    return tabs;
  }
  function openFileInActiveTabs(file) {
    const workspace = useService("workspace");
    const activeTabs = workspace.activeLeaf?.parent;
    if (activeTabs.findLeaf((leaf) => leaf.state.path === file)) {
      workspace.activeLeaf = activeTabs.toggleTab(file);
      return;
    }
    activeTabs.appendChild(createEditorLeaf(file));
    workspace.activeLeaf = activeTabs.activeLeaf;
  }
  function createLeaf(state) {
    const leaf = new WorkspaceLeaf();
    if (state) leaf.setState(state);
    return leaf;
  }
  function createEditorLeaf(filePath) {
    return createLeaf({
      type: MarkdownView.type,
      state: {
        path: filePath
      }
    });
  }
  var RE_TYPE = /^typ:\/\/([^/]+)/;
  function createCustomLeaf(path2) {
    const type = (path2.match(RE_TYPE) ?? [])[1];
    if (!type) throw Error(`View "${type}" has not registered.`);
    return createLeaf({
      type,
      state: {
        path: path2
      }
    });
  }
  function createEmptyLeaf() {
    return createLeaf({
      type: EmptyView.type,
      state: {
        path: uniqueId(`typ://${EmptyView.type}/`) + "/New tab"
      }
    });
  }
  function splitRight(path2) {
    split("vertical", path2);
  }
  function splitDown(path2) {
    split("horizontal", path2);
  }
  function split(direction, path2) {
    const workspace = useService("workspace");
    const previousTabs = workspace.activeLeaf?.closest("tabs");
    const parentSplit = previousTabs?.closest("split");
    if (parentSplit.direction === direction)
      parentSplit.appendChild(createTabs(path2));
    else {
      const newSplit = useService("workspace-split", [direction]);
      parentSplit.replaceChild(previousTabs, newSplit);
      newSplit.appendChild(previousTabs);
      newSplit.appendChild(createTabs(path2));
    }
  }
  function ensureRightSidedockLeaf(uri) {
    const workspace = useService("workspace");
    const type = (uri.match(RE_TYPE) ?? [])[1];
    const existing = workspace.rightSplit.findLeaf((leaf2) => leaf2.type === type);
    if (existing) return;
    const tabs = useService("workspace-tabs");
    const leaf = createCustomLeaf(uri);
    tabs.appendChild(leaf);
    workspace.rightSplit.appendChild(tabs);
  }
  function openFloatingLeaf(arg0) {
    const workspace = useService("workspace");
    const tabs = useService("workspace-tabs");
    const leaf = typeof arg0 === "string" ? createCustomLeaf(arg0) : arg0;
    const { view, state } = leaf;
    const { containerEl } = view;
    let titlebar;
    containerEl.classList.add("typ-workspace-floating");
    decorate.afterCall(view, "onload", () => {
      state.theme === "default" && defaultTheme(containerEl);
      state.theme === "window" && (windowTheme(containerEl, state.path.split("/").pop()), titlebar = containerEl.querySelector(".typ-titlebar"));
      state.resizable && view.register(resizable(containerEl));
      state.draggable && view.register(draggable2(containerEl, titlebar));
      state.onClose && view.register(closable(titlebar ?? containerEl, state.onClose));
    });
    tabs.appendChild(leaf);
    workspace.floatingSplit.appendChild(tabs);
  }

  // vendor/workspace_core/src/ui/layout/tabs/contextmenu.ts
  function onTabsContextMenu(root, i18n = useService("i18n"), workspace = useService("workspace")) {
    const { t } = i18n;
    const menu = new Menu();
    return function(event) {
      const $tabEl = $(event.target).closest(".typ-tab");
      if (!$tabEl.length) return;
      const clickedTabPath = $tabEl.data("id");
      const tabsEl = $tabEl.closest(".typ-workspace-tabs")[0];
      const tabs = root.findNode((n) => n.containerEl === tabsEl);
      menu.empty().addItem((item) => {
        item.setKey("removeTab").setTitle(t.tabview.close).onClick(() => tabs.removeTab(clickedTabPath));
      }).addItem((item) => {
        item.setKey("removeOthers").setTitle(t.tabview.closeOthers).onClick(() => {
          workspace.activeLeaf = tabs.removeOthers(clickedTabPath);
        });
      }).addItem((item) => {
        item.setKey("removeRight").setTitle(t.tabview.closeRight).onClick(() => {
          workspace.activeLeaf = tabs.removeRight(clickedTabPath);
        });
      });
      if (tabs.children.length > 1) {
        menu.addSeparator().addItem((item) => {
          item.setKey("splitRight").setTitle(t.tabview.splitRight).onClick(() => {
            tabs.removeTab(clickedTabPath);
            setTimeout(() => splitRight(clickedTabPath), 167);
          });
        }).addItem((item) => {
          item.setKey("splitDown").setTitle(t.tabview.splitDown).onClick(() => {
            tabs.removeTab(clickedTabPath);
            setTimeout(() => splitDown(clickedTabPath), 167);
          });
        });
      }
      menu.showAtMouseEvent(event);
    };
  }

  // vendor/workspace_core/src/ui/components/tabs.ts
  var TabContainer = class extends View {
    constructor(props) {
      super();
      this.props = props;
      this.containerEl = html`<div class="typ-tabs-wrapper ${props.className}"></div>`;
      this.containerEl.append(
        this.container = $('<div class="typ-tabs"></div>').on("click", (event) => {
          const $clickedEl = $(event.target);
          const $tab = $clickedEl.closest(".typ-tab");
          if (!$tab.length) return;
          const tabId = $tab.data("id");
          if ($clickedEl.hasClass("typ-close")) {
            this.props.onClose(tabId, $tab[0]);
          } else {
            if ($tab.hasClass("active")) return;
            this.props.onToggle(tabId, $tab[0]);
          }
        }).on("mousedown", (event) => {
          if (event.button !== 1) return;
          const $clickedEl = $(event.target);
          const $tab = $clickedEl.closest(".typ-tab");
          if (!$tab.length) return;
          const tabId = $tab.data("id");
          this.props.onClose(tabId, $tab[0]);
        }).on("wheel", (event) => {
          event.preventDefault();
          const el = event.target;
          let tabs;
          if (tabs = el.closest(".typ-tabs-wrapper")) {
            const evt = event.originalEvent;
            tabs.scrollLeft += evt.deltaY;
          }
        }).get(0)
      );
      if (props.draggable) draggable(this.containerEl, "x");
    }
    container;
    showTab(tabEl) {
      this.containerEl.scrollLeft = tabEl.offsetLeft;
    }
    addTab(tab) {
      this.insertTab(this.container.children.length, tab);
    }
    insertTab(index, tab) {
      this.activeTab(tab.containerEl);
      this.container.insertBefore(tab.containerEl, this.container.children[index]);
      this.showTab(tab.containerEl);
    }
    renameTab(tabEl, tab) {
      const isActive = tabEl.classList.contains("active");
      tabEl.replaceWith(tab.containerEl);
      if (isActive) tab.containerEl.classList.add("active");
    }
    activeTab(tabEl) {
      $(".typ-tab.active", this.containerEl).removeClass("active");
      tabEl.classList.add("active");
    }
    closeTab(tabEl) {
      if (tabEl.classList.contains("active")) {
        const siblingTab = this.getSiblingTab(tabEl);
        if (siblingTab) {
          this.activeTab(siblingTab);
          this.props.onToggle(siblingTab.dataset.id, siblingTab);
        }
      }
      tabEl.remove();
    }
    closeOtherTabs(tabEl) {
      Array.from(this.container.children).filter((el) => el !== tabEl).forEach((el) => this.props.onClose(el.dataset.id, el));
    }
    closeRightTabs(tabEl) {
      const tabEls = Array.from(this.container.children);
      const currentIdx = tabEls.findIndex((el) => el.dataset.id === tabEl.dataset.id);
      const rightTabEls = tabEls.slice(currentIdx).slice(1);
      rightTabEls.forEach((el) => this.props.onClose(el.dataset.id, el));
    }
    getActiveTab() {
      return this.container.querySelector(".typ-tab.active");
    }
    getTabById(id) {
      return $(`.typ-tab[data-id="${id.replace(/\\/g, "\\\\")}"]`, this.container)[0];
    }
    getSiblingTab(tabEl) {
      return tabEl.previousElementSibling ?? tabEl.nextElementSibling;
    }
  };
  var Tab = class extends View {
    constructor(props) {
      super();
      this.containerEl = $(`<div class="typ-tab" data-id="${props.id}" draggable="true"></div>`).attr("title", props.title || "").append(
        typeof props.text === "function" ? props.text() : props.text
      ).append(html`<i class="typ-icon typ-close"></i>`).get(0);
    }
  };

  // vendor/workspace_core/src/ui/layout/tabs/file-tabs.ts
  var MAX_LENGHT = { length: 20, omission: "\u2026" };
  var FileTabContainer = class extends TabContainer {
    static hideTabExtension(isHide) {
      $(document.body).toggleClass("typ-file-ext--hide", isHide);
    }
  };
  var UntitledTab = class extends Tab {
    constructor() {
      const shortName = "Untitled";
      super({
        id: "",
        text: () => $(`<i class="typ-file-icon fa fa-file-o"></i><span class="typ-file-basename">${shortName}</span>`),
        title: shortName
      });
    }
  };
  var FileTab = class extends Tab {
    constructor(filePath, vault = useService("vault")) {
      const isUri = filePath.startsWith("typ://");
      const longPath = isUri ? filePath : simplifyFilePath(vault.path, filePath);
      const ext = path_default.extname(filePath);
      const shortName = truncate(path_default.basename(longPath, ext), MAX_LENGHT);
      super({
        id: filePath,
        text: () => $(`<i class="typ-file-icon fa fa-file-o"></i><span class="typ-file-basename">${shortName}</span><span class="typ-file-ext">${ext}</span>`),
        title: isUri ? shortName : longPath
      });
    }
  };
  function simplifyFilePath(root, filePath) {
    return path_default.relative(root, filePath).replace(/(\.textbundle)[\\/]text\.(?:md|markdown)$/, "$1");
  }

  // vendor/workspace_core/src/ui/layout/workspace-root.ts
  var WorkspaceRoot = class extends WorkspaceSplit {
    registry = new Component();
    constructor(workspace, app = useService("app"), commands = useService("command-manager"), { t } = useService("i18n"), settings = useService("settings"), vault = useEventBus("vault")) {
      super("vertical");
      $(this.containerEl).addClass("typ-workspace-root");
      this.registry.onload = () => {
        $(this.containerEl).insertBefore("content");
        this.registry.registerDomEvent(this.containerEl, "click", (e) => {
          const LeafEl = e.target.closest(".typ-workspace-leaf");
          if (LeafEl) workspace.activeLeaf = this.findLeaf((leaf) => leaf.containerEl === LeafEl);
          const $anchorEl = $(e.target).closest("a");
          if ($anchorEl.length) {
            const url = $anchorEl.attr("href");
            if (url) {
              e.preventDefault();
              e.stopPropagation();
              app.openLink($anchorEl.attr("href"));
            } else {
              editor.tryOpenLink($anchorEl);
            }
          }
        });
        this.registry.registerDomEvent(this.containerEl, "contextmenu", onTabsContextMenu(this));
        this.registry.register(draggableTabs(this));
        FileTabContainer.hideTabExtension(settings.get("hideExtensionInFileTab"));
        this.registry.register(
          settings.onChange("hideExtensionInFileTab", (_, isHide) => {
            FileTabContainer.hideTabExtension(isHide);
          })
        );
        this.registry.register(
          workspace.on("file:will-open", (file) => {
            const { editingTabs } = useEditingTabs();
            if (
              // handle: after closing the only file, it should be able to be opened again.
              file === workspace.activeFile && // handle: do not re-execute after `openFileInActiveTabs` has be called once.
              //         [Call Chain] 'file:will-open' → openFileInActiveTabs() → MarkdownView#onOpen() → editor.library.openFile() → 'file:will-open'
              file !== editingTabs()?.activeLeaf.state.path
            ) {
              openFileInActiveTabs(file);
            }
          })
        );
        this.registry.register(
          decorate(editor.library, "openFile", (fn) => (file, callback) => {
            const { editingTabs, isEditingTabs } = useEditingTabs();
            const activeTabs = workspace.activeLeaf?.parent;
            if (!editingTabs() || // handle: click file tree → open file in ActivedTabs
            isEditingTabs(activeTabs) || // handle: (drag ActivedTab → close ActivedTab → open SiblingTab → open file in Non-ActivedTabs) in the Tabs with MarkdownEditorView (mode: Typora)
            editingTabs().activeLeaf.state.path === file)
              fn(file, callback);
            else
              setTimeout(() => openFileInActiveTabs(file));
          })
        );
        this.registry.register(workspace.on("file:open", (file) => {
          const { isPreviewFileToSwap } = usePreviewTabToSwap();
          if (isPreviewFileToSwap(file)) return;
          if (workspace.activeLeaf?.state.path === file) return;
          const { editingTabs } = useEditingTabs();
          if (editingTabs()?.activeLeaf.state.path === file) return;
          openFileInActiveTabs(file);
        }));
        this.registry.register(
          vault.on("file:rename", (oldPath, newPath) => {
            const tabs = this.findLeaf((leaf) => leaf.state.path === oldPath)?.parent;
            tabs.renameTab(oldPath, newPath);
          })
        );
        this.registry.register(
          vault.on("directory:rename", (oldDirPath, newDirPath) => {
            this.eachLeaves((leaf) => {
              if (!leaf.state.path.startsWith(oldDirPath)) return;
              const oldFilePath = leaf.state.path;
              const newFilePath = newDirPath + oldFilePath.slice(oldDirPath.length);
              const tabs = leaf.parent;
              tabs.renameTab(oldFilePath, newFilePath);
            });
          })
        );
        this.registry.register(
          vault.on("file:delete", (file) => {
            this.findLeaf((leaf) => leaf.state.path === file)?.detach();
          })
        );
        this.registry.register(
          workspace.on("file-menu", ({ menu, path: path2 }) => {
            menu.insertItemAfter('[data-action="open"]', (item) => {
              item.setKey("typ-split-right").setTitle(t.workspace.fileContextMenuSplitRight).onClick((event) => splitRight(path2));
            });
          })
        );
        this.registry.register(
          commands.register({
            id: "core.workspace:split-right",
            title: t.workspace.commandSplitRight,
            scope: "global",
            callback: splitRight
          })
        );
        this.registry.register(
          commands.register({
            id: "core.workspace:split-down",
            title: t.workspace.commandSplitDown,
            scope: "global",
            callback: splitDown
          })
        );
        this.registry.register(
          commands.register({
            id: "core.workspace:reset",
            title: t.workspace.commandReset,
            scope: "global",
            callback: () => {
              this.registry.unload();
              this.registry.load();
            }
          })
        );
        this.registry.register(
          decorate.parameters(editor.selection, "scrollAdjust", ([$el, offset, p2, p3]) => {
            if ($el && offset) offset += 28;
            return [$el, offset, p2, p3];
          })
        );
        if (workspace.activeFile) {
          this.appendChild(createTabs(workspace.activeFile));
        } else {
          this.appendChild(createUntitledTabs());
        }
        workspace.activeLeaf = this.children[0].children[0];
      };
      this.registry.onunload = () => {
        const activeTabs = workspace.activeLeaf?.parent;
        activeTabs.removeOthers(workspace.activeLeaf?.state.path);
        this.eachLeaves((leaf) => leaf.detach());
        this.children.reverse().forEach((child) => child.detach());
        workspace.floatingSplit.eachLeaves((leaf) => leaf.detach());
        this.containerEl.remove();
        workspace.activeLeaf = null;
        setTimeout(() => editor.writingArea.parentElement.setAttribute("class", ""));
        const { setEditingTabs } = useEditingTabs();
        setEditingTabs(null);
      };
      setTimeout(() => this.registry.load());
    }
  };

  // vendor/workspace_core/src/ui/layout/floating/index.ts
  var WorkspaceFloating = class extends WorkspaceParent {
    type = "floating";
    registry = new Component();
    constructor(commands = useService("command-manager"), settings = useService("settings")) {
      super();
      $(this.containerEl).addClass("typ-workspace-floating").css({ display: "none" });
      this.registry.onload = () => {
        this.registry.register(
          commands.register({
            id: "core.workspace.floating-split:open-leaf",
            title: "Open floating leaf",
            scope: "global",
            showInCommandPanel: false,
            callback: openFloatingLeaf
          })
        );
      };
      setTimeout(() => this.registry.load());
    }
    /**
     * Do not mount child DOM into the floating container:
     * Floating children are positioned and rendered independently (e.g., popups/overlays),
     * avoiding entry into the main layout's flex flow.
     */
    _insertChildEl(_index, _child) {
    }
    _removeChild(child) {
      const index = this.children.findIndex((c) => c === child);
      if (index === -1) return;
      this.children.splice(index, 1);
      child.setParent(null);
    }
  };

  // vendor/workspace_core/src/ui/layout/use-active-leaf.ts
  var useActiveLeaf = memorize(function() {
    let _activeLeaf;
    function getActiveLeaf(rootSplit = useService("workspace-root")) {
      if (!_activeLeaf?.parent) {
        setActiveLeaf(rootSplit.children[0]?.children[0]);
      }
      return _activeLeaf;
    }
    function setActiveLeaf(leaf, rootSplit = useEventBus("workspace-root"), workspace = useEventBus("workspace")) {
      if (_activeLeaf === leaf) return;
      _activeLeaf && rootSplit.emit("leaf:will-deactive", _activeLeaf);
      _activeLeaf?.parent?.containerEl.classList.remove("mod-active");
      _activeLeaf = leaf;
      leaf?.parent?.containerEl.classList.add("mod-active");
      leaf && rootSplit.emit("leaf:active", leaf);
      leaf && workspace.emit("active-leaf:change", leaf);
    }
    return [getActiveLeaf, setActiveLeaf];
  });

  // vendor/workspace_core/src/ui/layout/sidedock/index.ts
  var WorkspaceSidedock = class _WorkspaceSidedock extends WorkspaceParent {
    constructor(side, onToggle, commands = useService("command-manager"), settings = useService("settings"), i18n = useService("i18n")) {
      super();
      this.onToggle = onToggle;
      this.settings = settings;
      this.side = side;
      this.size = Math.max(_WorkspaceSidedock.MIN_SIZE, this.settings.get("rightSplitWidth"));
      const sideClass = `mod-${side}-split`;
      $(this.containerEl).addClass(`typ-workspace-sidedock ${sideClass}`);
      this.resizeHandleEl.classList.add("sidedock-resize-handle");
      $(this.resizeHandleEl).off("mousedown").on("mousedown", (e) => {
        e.stopImmediatePropagation();
        this._onResizeStart(e.originalEvent);
      });
      this.contentEl = $('<div class="sidedock-content">')[0];
      this.containerEl.appendChild(this.contentEl);
      this.emptyStateEl = $(`<div class="workspace-sidedock-empty-state">
      <p class="u-muted">${i18n.t.workspace.rightSplit.empty}</p>
    </div>`)[0];
      this.containerEl.appendChild(this.emptyStateEl);
      this.collapse();
      this.registry.onload = () => {
        this.registry.register(
          commands.register({
            id: "core.workspace.right-split:ensure-leaf",
            title: "Ensure leaf",
            scope: "global",
            showInCommandPanel: false,
            callback: ensureRightSidedockLeaf
          })
        );
      };
      setTimeout(() => this.registry.load());
    }
    type = "sidedock";
    static MIN_SIZE = 280;
    size = _WorkspaceSidedock.MIN_SIZE;
    // default width in px
    collapsed = false;
    // collapse state
    side;
    // which side this dock is on
    contentEl;
    // .sidedock-content
    emptyStateEl;
    // empty state hint
    registry = new Component();
    /** Collapse the side dock */
    collapse() {
      if (this.collapsed) return;
      this.collapsed = true;
      $(this.containerEl).addClass("is-sidedock-collapsed");
      this.setSize(0);
      this.onToggle?.(true);
    }
    /** Expand the side dock to its configured size */
    expand() {
      if (!this.collapsed) return;
      this.collapsed = false;
      $(this.containerEl).removeClass("is-sidedock-collapsed");
      this.setSize(this.size);
      this.onToggle?.(false);
    }
    /** Toggle collapse/expand state */
    toggle() {
      this.collapsed ? this.expand() : this.collapse();
    }
    /** Set the dock width to `n` px (minimum 180) */
    setSize(n) {
      if (n > 0) {
        this.size = Math.max(_WorkspaceSidedock.MIN_SIZE, n);
        this.settings.set("rightSplitWidth", this.size);
      }
      document.body.style.setProperty("--typ-sidedock-width", (n > 0 ? this.size : 0) + "px");
    }
    /** Override: insert child DOM into the content area */
    _insertChildEl(index, child) {
      if (this.emptyStateEl.parentNode === this.contentEl) {
        this.contentEl.insertBefore(child.containerEl, this.emptyStateEl);
      } else {
        this.contentEl.appendChild(child.containerEl);
      }
      if (this.children.length > 0) {
        this.emptyStateEl.style.display = "none";
      }
    }
    _removeChild(child) {
      const index = this.children.findIndex((c) => c === child);
      this.children.splice(index, 1);
      child.setParent(null);
      child.containerEl.remove();
      if (this.children.length === 0) {
        this.emptyStateEl.style.display = "";
        if (!this.collapsed) {
          this.collapse();
        }
      }
    }
    /** Mouse drag to resize the dock */
    _onResizeStart(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      const dock = this;
      let dragging = true;
      const startPos = e.clientX;
      const startSize = dock.size;
      function onMouseMove(e2) {
        if (!dragging) return;
        const delta = startPos - e2.clientX;
        let newSize = startSize + delta;
        if (newSize < 50) {
          dock.collapse();
          dragging = false;
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          return;
        }
        newSize = Math.max(_WorkspaceSidedock.MIN_SIZE, newSize);
        dock.setSize(newSize);
      }
      function onMouseUp() {
        dragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
  };

  // vendor/workspace_core/src/ui/workspace.ts
  var Workspace = class extends Events {
    _children = [];
    ribbon;
    sidebar;
    rootSplit = new WorkspaceRoot(this);
    /**
     * Floating container: holds views detached from the main layout (rootSplit).
     */
    floatingSplit = new WorkspaceFloating();
    /**
     * Right side dock panel.
     * Similar to Obsidian's `workspace.rightSplit`.
     *
     * @since v2.10.0
     */
    rightSplit;
    get activeLeaf() {
      const [getActiveLeaf] = useActiveLeaf();
      return getActiveLeaf();
    }
    set activeLeaf(leaf) {
      const [, setActiveLeaf] = useActiveLeaf();
      setActiveLeaf(leaf);
    }
    activeEditor;
    /**
     * Openned file's path
     */
    get activeFile() {
      return File.filePath ?? File.bundle.filePath;
    }
    constructor(app = useEventBus("app"), viewManager = useService("view-manager")) {
      super("workspace");
      this.rightSplit = new WorkspaceSidedock("right", (collapsed) => {
        if (collapsed) {
          document.body.classList.remove("is-right-sidedock-open");
        } else {
          document.body.classList.add("is-right-sidedock-open");
        }
      });
      app.once("load", () => this._emitMissingEvents());
      this._registerEventHooks();
      this._children.push(noticeContainer);
      this._children.push(this.ribbon = useService("ribbon"));
      this._children.push(this.sidebar = new Sidebar(() => [
        new GlobalSearchView(),
        useService("file-explorer"),
        new Outline()
      ]));
      this._children.push(new CommandModal());
      this._children.push(useService("input-box"));
      this._children.push(useService("quick-pick"));
      this._children.push(new QuickOpenPanel());
      this.activeEditor = useService("markdown-editor");
      setTimeout(() => this._children.forEach((child) => child.load()));
      document.body.appendChild(this.rightSplit.containerEl);
      viewManager.registerViewWithExtensions(["md", "markdown"], MarkdownView.type, (leaf, s) => new MarkdownView(leaf));
      viewManager.registerView(EmptyView.type, (leaf) => new EmptyView(leaf));
    }
    createLeaf = createLeaf;
    getViewByType(cls) {
      let res = void 0;
      this.iterateViews(this, (v) => {
        if (v instanceof cls) {
          res = v;
          return true;
        }
      });
      return res;
    }
    /**
     * Iterate all views in view tree.
     *
     * @param callback return `true` to stop iteration
     */
    iterateViews(view, callback) {
      const children = view._children;
      for (let i = 0; i < children.length; i++) {
        const childView = children[i];
        if (callback(childView)) break;
        if (!childView._children.length) continue;
        this.iterateViews(childView, callback);
      }
    }
    /**
     * Iterate all leaves in the whole layout tree (rootSplit + floatingSplit + rightSplit).
     *
     * @param callback return `true` to stop iteration
     */
    eachLeaves(callback) {
      this.rootSplit.eachLeaves(callback);
      this.floatingSplit.eachLeaves(callback);
      this.rightSplit.eachLeaves(callback);
    }
    findLeaf(iteratee) {
      return this.rootSplit.findLeaf(iteratee) ?? this.floatingSplit.findLeaf(iteratee) ?? this.rightSplit.findLeaf(iteratee);
    }
    filterLeaves(iteratee) {
      return [
        ...this.rootSplit.filterLeaves(iteratee),
        ...this.floatingSplit.filterLeaves(iteratee),
        ...this.rightSplit.filterLeaves(iteratee)
      ];
    }
    _emitMissingEvents() {
      if (this.activeFile) {
        this.emit("file:open", this.activeFile);
      }
    }
    _registerEventHooks() {
      decorate.beforeCall(editor.library, "openFile", ([file]) => {
        this.emit("file:will-open", file);
      });
      const onFileOpened = File.loadInitData ? "loadInitData" : "loadFile";
      decorate.afterCall(File, onFileOpened, () => {
        if (this.activeFile) {
          setTimeout(() => this.emit("file:open", this.activeFile));
        }
      });
      File.isNode ? decorate.beforeCall(File, "saveUseNode", () => {
        this.emit("file:will-save", this.activeFile);
      }) : (() => {
        let start = 0;
        decorate.afterCall(File, "validateContentForSave", () => {
          start = Date.now();
        });
        decorate.beforeCall(File, "sync", () => {
          if (Date.now() - start >= 50) return;
          this.emit("file:will-save", this.activeFile);
        });
      })();
      setTimeout(() => useService("file-explorer")._onContextMenu((params) => {
        this.emit("file-menu", params);
      }));
    }
  };

  // vendor/workspace_core/src/ui/editor/preprocessor/string-mask.ts
  var ESCAPE_CHAR = "\\";
  var StringMask = class {
    constructor(placeholder) {
      this.placeholder = placeholder;
    }
    _cache = [];
    unmask(s) {
      this._cache.reverse();
      return s.replace(new RegExp(this.placeholder, "g"), ($2) => {
        return this._cache.pop();
      });
    }
    processMasked(processor) {
      this._cache = this._cache.map((s) => processor(s));
    }
    reset() {
      this._cache = [];
    }
  };
  var RegexpBasedStringMask = class extends StringMask {
    /**
     * @param regexp First character include `.` for matching excape character `\`.
     * @param placeholder
     */
    constructor(regexp, placeholder) {
      super(placeholder);
      this.regexp = regexp;
    }
    mask(s) {
      return s.replace(this.regexp, ($2, ...args) => {
        const offset = args.at(-2);
        if (s[offset - 1] === ESCAPE_CHAR) return $2;
        this._cache.push($2);
        return this.placeholder;
      });
    }
  };
  var SELF_CLOSING_TAGS = "area,base,br,col,command,embed,hr,img,input,keygen,link,meta,param,source,track,wbr".split(",");
  var HtmlMask = class extends StringMask {
    constructor(placeholder) {
      super(placeholder);
    }
    findHtmlRanges(md) {
      const ranges = [];
      const stack = [];
      const regex = /\\?<\/?([a-zA-Z][a-zA-Z-]*)[^>\n]*?>/g;
      let match2;
      while ((match2 = regex.exec(md)) !== null) {
        const tag = match2[0];
        if (tag.startsWith("\\")) continue;
        const tagName = match2[1];
        const start = match2.index;
        const end = start + tag.length - 1;
        if (tag[1] !== "/") {
          if (tagName.startsWith("http")) {
            continue;
          } else if (SELF_CLOSING_TAGS.includes(tagName)) {
            if (stack.length === 0)
              ranges.push({ start, end });
          } else
            stack.push({ tagName, start, end });
        } else {
          const lastTag = stack.pop();
          if (!lastTag) {
            throw new Error(`Tag </${tagName}> is not opened.`);
          }
          if (lastTag.tagName !== tagName) {
            throw new Error(`Tag <${lastTag.tagName}> closes with </${tagName}> incorrectly.`);
          }
          if (stack.length === 0) {
            ranges.push({
              start: lastTag.start,
              end
            });
          }
        }
      }
      if (stack.length > 0) {
        const lastTag = stack.pop();
        throw new Error(`Tag <${lastTag.tagName}> is not closed.`);
      }
      return ranges;
    }
    mask(s) {
      const ranges = this.findHtmlRanges(s);
      let start = 0;
      let res = "";
      for (const range of ranges) {
        res += s.slice(start, range.start) + this.placeholder;
        this._cache.push(s.slice(range.start, range.end + 1));
        start = range.end + 1;
      }
      res += s.slice(start, s.length);
      return res;
    }
  };

  // vendor/workspace_core/src/ui/editor/preprocessor/preprocessor.ts
  var RE_CODEBLOCK = /(?:^|\n)(.*`{3,})(?:.|\n)+?\1|(`+).+?\2/g;
  var MarkdownPreProcessor = class {
    constructor(logger = useService("logger", ["MarkdownPreProcessor"])) {
      this.logger = logger;
    }
    _processors = {
      preload: { code: [], mdtext: [], length: 0 },
      presave: { code: [], mdtext: [], length: 0 }
    };
    codeMasker = new RegexpBasedStringMask(RE_CODEBLOCK, "___CODE_PLACEHOLDER___");
    htmlMasker = new HtmlMask("___HTML_PLACEHOLDER___");
    register(processor) {
      const { when, type } = processor;
      const o = this._processors[when];
      o[type].push(processor);
      o.length++;
      return () => this.unregister(processor);
    }
    unregister(processor) {
      const { when, type } = processor;
      const o = this._processors[when];
      o[type] = o[type].filter((p) => p !== processor);
      o.length--;
    }
    isEmpty(when) {
      return !this._processors[when].length;
    }
    process(when, md) {
      this.codeMasker.reset();
      this.htmlMasker.reset();
      const original = md;
      try {
        md = this.codeMasker.mask(md);
        if (when === "preload") {
          md = this.htmlMasker.mask(md);
        }
        md = this._processors[when]["mdtext"].reduce((res, o) => o.process(res), md);
        this._processors[when]["code"].forEach(
          (p) => this.codeMasker.processMasked(p.process)
        );
        if (when === "preload") {
          md = this.htmlMasker.unmask(md);
        }
        md = this.codeMasker.unmask(md);
        return md;
      } catch (error) {
        this.logger.error(error);
        return original;
      }
    }
  };
  function bindPreProcessorToEditor(mdEditor) {
    const { preProcessor } = mdEditor;
    File.isNode ? decorate.returnValue(File, "readContentFrom", (args, res) => {
      if (preProcessor.isEmpty("preload")) {
        return res;
      }
      res[1] = preProcessor.process("preload", res[1]);
      return res;
    }) : decorate.parameters(File, "loadFile", (args) => {
      if (preProcessor.isEmpty("preload")) {
        return args;
      }
      args[2][0] = preProcessor.process("preload", args[2][0]);
      return args;
    });
    decorate.returnValue(editor, "getMarkdown", (args, md) => {
      if (preProcessor.isEmpty("presave")) {
        return md;
      }
      return preProcessor.process("presave", md);
    });
  }

  // vendor/workspace_core/src/ui/editor/postprocessor/postprocessor.ts
  var PostProcessor = class _PostProcessor {
    constructor(logger = useService("logger", ["PostProcessor"])) {
      this.logger = logger;
    }
    _process(el) {
      try {
        this.process(el, { containerEl: el });
      } catch (e) {
        this.logger.error(e);
      }
    }
    process(el, context) {
      throw new Error("Method not implemented.");
    }
    renderButton(parent, button) {
      const className = button.className ??= "typ-btn_" + randomString();
      const group = this.setupButtonContainer(parent);
      if (group.getElementsByClassName(className).length) {
        return;
      }
      const buttonEl = document.createElement("button");
      buttonEl.classList.add("typ-block-operate-button", className);
      buttonEl.innerHTML = button.text;
      buttonEl.title = button.title ?? "";
      buttonEl.onclick = (event) => button.onclick(event, {});
      group.append(buttonEl);
    }
    setupButtonContainer(codeblock) {
      let group = codeblock.querySelector(".typ-buttons");
      if (group) return group;
      group = document.createElement("div");
      group.className = "typ-buttons";
      group.addEventListener("mouseup", (event) => event.stopPropagation());
      codeblock.append(group);
      return group;
    }
    static from(options) {
      const processor = new _PostProcessor();
      if (typeof options === "function") {
        processor.process = options;
      } else {
        Object.assign(processor, options);
      }
      return processor;
    }
  };

  // vendor/workspace_core/src/ui/editor/postprocessor/html-postprocessor.ts
  var HtmlPostProcessor = class _HtmlPostProcessor extends PostProcessor {
    constructor(logger = useService("logger", ["HtmlPostProcessor"])) {
      super();
      this.logger = logger;
    }
    _selector = "";
    get selector() {
      return this._selector;
    }
    set selector(value) {
      this._selector = value;
    }
    process(el, context) {
      throw new Error("Method not implemented.");
    }
    _process(el) {
      try {
        const elements = this.selector ? $(this.selector, el).toArray() : [el];
        elements.forEach((selected) => this.process(selected, { containerEl: el }), this);
      } catch (error) {
        this.logger.error(error);
      }
    }
    static from(options) {
      const processor = new _HtmlPostProcessor();
      Object.assign(processor, options);
      return processor;
    }
  };

  // vendor/workspace_core/src/ui/editor/postprocessor/codeblock-postprocessor.ts
  var CodeblockPostProcessor = class _CodeblockPostProcessor extends HtmlPostProcessor {
    constructor(workspace = useService("workspace")) {
      super();
      this.workspace = workspace;
    }
    type = "codeblock";
    lang = [""];
    get selector() {
      const selector = this.lang.map((lang) => lang ? `[lang="${lang}"]` : "").map((langSelector) => `.md-fences${langSelector}:has(.CodeMirror)`).join(",");
      return selector;
    }
    button;
    exportPreview = false;
    preview(code, el) {
      throw new Error("Method not implemented.");
    }
    process(el, context) {
      if (this.button) {
        this.renderButton(el, this.button);
      }
      if (this.hasPreview()) {
        this.buildPreviewer(el, this.preview);
      }
    }
    /**
     * If override `preview()` to render codeblock preview, then return `true`
     */
    hasPreview() {
      return this.preview !== _CodeblockPostProcessor.prototype.preview;
    }
    renderButton(parent, button) {
      const btn = button;
      if (!btn.$button) {
        btn.$button = {
          ...button,
          onclick: (event) => {
            const pre = event.target.closest("pre");
            const code = this.getValueOfCodeblock(pre);
            button.onclick(event, { codeblock: pre, code });
          }
        };
      }
      super.renderButton(parent, btn.$button);
    }
    buildPreviewer(codeblock, preview) {
      if (codeblock.querySelector(".md-diagram-panel-preview")) {
        return;
      }
      const previewer = document.querySelector("#componenet > .md-diagram-panel").cloneNode(true);
      previewer.style.cssText = "position:initial; margin:0; padding:0;";
      previewer.addEventListener("click", () => {
        codeblock.classList.add("md-focus");
      });
      const containerEl = previewer.querySelector(".md-diagram-panel-preview");
      const render = async () => {
        const code = this.getValueOfCodeblock(codeblock);
        const previewEl = await preview(code, codeblock);
        containerEl.innerHTML = "";
        containerEl.append(previewEl);
      };
      render();
      codeblock.classList.add("md-diagram", "md-fences-advanced");
      codeblock.addEventListener("keyup", debounce(render, 1e3));
      codeblock.append(previewer);
    }
    getValueOfCodeblock(codeblock) {
      const rootEl = codeblock.closest("#write") ?? codeblock.closest(".typ-markdown-view");
      const cid = codeblock.getAttribute("cid");
      if (!cid) throw Error("`cid` of codeblock can not be empty.");
      if ($(rootEl).is("#write")) {
        return editor.fences.getCm(cid)?.getValue() ?? "";
      } else {
        const leaf = this.workspace.rootSplit.findLeaf((leaf2) => leaf2.view.containerEl === rootEl);
        const mdView = leaf?.view;
        return mdView?.getCodeMirrorInstance(cid)?.getValue() ?? "";
      }
    }
    static from(options) {
      const processor = new _CodeblockPostProcessor();
      Object.assign(processor, options);
      return processor;
    }
  };
  function blockMarkdownViewPreviewMode() {
    decorate.parameters(editor.fences, "refreshEditor", ([a0, a1, a2]) => [a0, a1, a2 ?? editor.writingArea]);
  }

  // vendor/workspace_core/src/export-manager.ts
  var ExportManager = class {
    _processors = [];
    constructor() {
      setTimeout(() => {
        const { postProcessor } = useService("markdown-editor");
        decorate.returnValue(editor.export, "exportToHTML", (args, html2) => {
          postProcessor.processAllCodeblock();
          const doc = new DOMParser().parseFromString(html2, "text/html");
          const ctx = {
            type: "html",
            html: html2,
            doc
          };
          this._processHtml(ctx);
          return `<!DOCTYPE HTML>
${doc.documentElement.outerHTML}`;
        });
      });
    }
    register(processor) {
      this._processors.push(processor);
      return () => this.unregister(processor);
    }
    unregister(processor) {
      this._processors = this._processors.filter((p) => p !== processor);
    }
    _processHtml(ctx) {
      this._processors.filter((p) => p.type === "html").forEach((p) => p.process(ctx));
    }
  };
  var ExportProcessor = class _ExportProcessor {
    type;
    process(context) {
    }
    static from(options) {
      const processor = new _ExportProcessor();
      Object.assign(processor, options);
      return processor;
    }
  };
  var HtmlExportProcessor = class _HtmlExportProcessor extends ExportProcessor {
    type = "html";
    process(context) {
    }
    static from(options) {
      const processor = new _HtmlExportProcessor();
      Object.assign(processor, options);
      return processor;
    }
  };
  var CodeblockExportProcessor = class _CodeblockExportProcessor extends HtmlExportProcessor {
    lang;
    process({ doc }) {
      const selectors = this.lang.map((l) => `pre[lang="${l}"]`);
      const previewSelectors = selectors.map((l) => `${l} .md-fences-adv-panel-preview`);
      const previews = $(previewSelectors.join(","));
      $(selectors.join(","), doc).removeClass().addClass("md-diagram-panel md-fences-adv-panel").empty().each((i, pre) => {
        $(pre).append($(previews[i].innerHTML));
      });
    }
    static from(options) {
      const processor = new _CodeblockExportProcessor();
      Object.assign(processor, options);
      return processor;
    }
  };

  // vendor/workspace_core/src/ui/editor/postprocessor/postprocessor-manager.ts
  var MarkdownPostProcessor = class {
    constructor(exporter = useService("exporter")) {
      this.exporter = exporter;
    }
    _processors = [];
    _codePreviewProcessors = {};
    process(writingArea, processors = this._processors) {
      processors.forEach((p) => p._process(writingArea));
    }
    processAll = (writingArea = editor.writingArea) => this.process(writingArea, this._processors);
    processAllCodeblock = (writingArea = editor.writingArea) => this.process(writingArea, this._processors.filter((p) => "type" in p && p.type === "codeblock"));
    register(processor) {
      if (typeof processor === "function") {
        processor = PostProcessor.from(processor);
      }
      let disposeExportProcessor = noop;
      if (processor instanceof CodeblockPostProcessor && processor.hasPreview()) {
        processor.lang.forEach((lang) => {
          if (this._codePreviewProcessors[lang]) {
            throw Error(`Codeblock postprocessor for lang "${lang}" is already registered.`);
          }
          this._codePreviewProcessors[lang] = processor;
        });
        if (processor.exportPreview) {
          disposeExportProcessor = this.exporter.register(CodeblockExportProcessor.from({ lang: processor.lang }));
        }
      }
      this._processors.push(processor);
      return () => {
        this.unregister(processor);
        disposeExportProcessor();
      };
    }
    unregister(processor) {
      if (processor instanceof CodeblockPostProcessor && processor.hasPreview()) {
        processor.lang.forEach((lang) => {
          delete this._codePreviewProcessors[lang];
        });
      }
      this._processors = this._processors.filter((p) => p !== processor);
    }
  };
  function bindPostProcessorToEditor(mdEditor) {
    const { postProcessor } = mdEditor;
    setTimeout(() => {
      useEventBus("workspace-root").on("leaf:open", (leaf) => {
        if (leaf.type === MarkdownView.type && leaf.view.isEditor())
          postProcessor.processAll();
      });
    });
    mdEditor.on("edit", postProcessor.processAll);
    mdEditor.on("scroll", postProcessor.processAllCodeblock);
  }

  // vendor/workspace_core/src/ui/editor/selection.ts
  var EditorSelection = class {
    selected;
    constructor(markdownEditor = useEventBus("markdown-editor")) {
      markdownEditor.on("edit", () => {
        this.selected = null;
      });
    }
    save() {
      this.selected = editor.selection.getRangy();
    }
    restore() {
      this.selected?.select();
    }
    /**
     * Get cursor position as text offset from the start of #write's text content.
     * Returns null if cursor is outside #write or no selection exists.
     */
    getCursor() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const container = editor.writingArea;
      const focusNode = sel.focusNode;
      const focusOffset = sel.focusOffset;
      if (!container || !focusNode) return null;
      if (!container.contains(focusNode)) return null;
      const treeWalker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );
      let textOffset = 0;
      let node;
      while (node = treeWalker.nextNode()) {
        if (node === focusNode) {
          textOffset += focusOffset;
          return textOffset;
        }
        textOffset += node.textContent?.length ?? 0;
      }
      return textOffset;
    }
    /**
     * Set cursor position to the given text offset from the start of #write's text content.
     */
    setCursor(offset) {
      const container = editor.writingArea;
      const treeWalker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );
      let accumulated = 0;
      let textNode;
      let found = false;
      while (textNode = treeWalker.nextNode()) {
        const len = textNode.textContent?.length ?? 0;
        if (accumulated + len >= offset) {
          const nodeOffset = offset - accumulated;
          const range = document.createRange();
          range.setStart(textNode, nodeOffset);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          found = true;
          break;
        }
        accumulated += len;
      }
      if (!found) {
        const range = document.createRange();
        range.selectNodeContents(container);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  // vendor/workspace_core/src/ui/editor/suggestion/suggest.ts
  var EditorSuggest = class {
    _query = "";
    _placeholder = [];
    get isUsing() {
      return editor.autoComplete.state.all === this._placeholder;
    }
    _handlers = {
      search: this.getSuggestions.bind(this),
      render: this._renderSuggestion.bind(this)
    };
    canTrigger(textBefore, textAfter, range) {
      return !!textBefore;
    }
    show(range, query) {
      this._query = query;
      editor.autoComplete.show(this._placeholder, range, query, this._handlers);
    }
    hide() {
      editor.autoComplete.hide();
    }
    /**
     * @returns HTML string
     */
    _renderSuggestion(suggest, isActive) {
      const className = `typ-suggestion ${isActive ? "active" : ""}`;
      const id = this.getSuggestionId(suggest);
      const text = this.renderSuggestion(suggest);
      return `<li class="${className}" data-content="${id}">${text}</li>`;
    }
    /**
     * @returns HTML string
     */
    renderSuggestion(suggest) {
      return suggest.toString();
    }
    _beforeApply(matched) {
      if (typeof matched === "string")
        return this.beforeApply(this.getSuggestionById(matched));
      else
        return this.beforeApply(matched);
    }
    lengthOfTextBeforeToBeReplaced(query) {
      return query.length + this.triggerText.length;
    }
  };

  // vendor/workspace_core/src/ui/editor/suggestion/merged-suggest.ts
  var MergedSuggest = class extends EditorSuggest {
    _suggests = [];
    _suggestions = [];
    triggerText = "";
    constructor(triggerText) {
      super();
      this.triggerText = triggerText;
    }
    add(suggest) {
      if (suggest.triggerText !== this.triggerText) {
        throw Error("[MergedSuggest] Can not merge a suggest with a different `triggerText`");
      }
      this._suggests.push(suggest);
    }
    delete(suggest) {
      this._suggests = this._suggests.filter((s) => s !== suggest);
    }
    canTrigger(textBefore, textAfter, range) {
      let canTrigger = false;
      this._suggests.forEach((s) => {
        const res = s.canTrigger(textBefore, textAfter, range);
        if (res) canTrigger = res;
      });
      return canTrigger;
    }
    findQuery(textBefore, textAfter, range) {
      let isMatched = false;
      let firstQuery = "";
      for (const s of this._suggests) {
        const res = s.findQuery(textBefore, textAfter, range);
        if (res.isMatched) {
          s._query = res.query;
          if (!isMatched) {
            isMatched = true;
            firstQuery = res.query;
          }
        }
      }
      return isMatched ? { isMatched: true, query: firstQuery } : { isMatched: false };
    }
    lengthOfTextBeforeToBeReplaced(query) {
      return this._suggests[0].lengthOfTextBeforeToBeReplaced(query);
    }
    getSuggestions(query) {
      this._suggestions = [];
      this._suggests.forEach((suggest, index) => {
        suggest.getSuggestions(suggest._query).forEach((s) => {
          const id = this._generateMergedId(index, suggest.getSuggestionId(s));
          this._suggestions.push({ id, suggest, suggestion: s });
        });
      });
      return this._suggestions;
    }
    _generateMergedId(sourceIndex, id) {
      return `merged_${sourceIndex}_${id}`;
    }
    getSuggestionId(suggestion) {
      return suggestion.id;
    }
    renderSuggestion(s) {
      return s.suggest.renderSuggestion(s.suggestion);
    }
    getSuggestionById(id) {
      return this._suggestions.find((s) => s.id === id);
    }
    beforeApply(s) {
      return s.suggest.beforeApply(s.suggestion);
    }
  };

  // vendor/workspace_core/src/ui/editor/suggestion/suggest-manager.ts
  var EditorSuggestManager = class {
    _currentSuggest;
    _suggests = [];
    constructor(markdownEditor = useEventBus("markdown-editor")) {
      markdownEditor.on("edit", this._onEdit.bind(this));
      decorate.beforeCall(editor.autoComplete, "show", ([match2]) => {
        if (editor.autoComplete.state.all !== match2)
          editor.autoComplete.initState();
      });
      decorate(editor.autoComplete, "apply", (fn) => (text) => {
        if (this._currentSuggest?.isUsing) {
          const range = editor.selection.getRangy();
          const { anchor } = editor.autoComplete.state;
          const textNode = anchor.containerNode.firstChild;
          const suggest = this._currentSuggest;
          range.setStart(textNode, anchor.start - suggest.lengthOfTextBeforeToBeReplaced(suggest._query));
          range.setEnd(textNode, anchor.end);
          editor.selection.setRange(range, true);
          editor.UserOp.pasteHandler(editor, suggest._beforeApply(text), true);
          editor.autoComplete.hide();
          return;
        }
        fn(text);
      });
    }
    register(suggest) {
      const sameTriggerSuggest = this._suggests.find((s) => s.triggerText === suggest.triggerText);
      if (sameTriggerSuggest) {
        let mergedSuggest;
        if (sameTriggerSuggest instanceof MergedSuggest) {
          mergedSuggest = sameTriggerSuggest;
        } else {
          mergedSuggest = new MergedSuggest(suggest.triggerText);
          this.unregister(sameTriggerSuggest);
          this._suggests.push(mergedSuggest);
          mergedSuggest.add(sameTriggerSuggest);
        }
        mergedSuggest.add(suggest);
      } else {
        this._suggests.push(suggest);
      }
      return () => this.unregister(suggest);
    }
    unregister(suggest) {
      const filtered = this._suggests.filter((s) => s !== suggest);
      if (filtered.length < this._suggests.length)
        this._suggests = filtered;
      else
        this._suggests.forEach((s) => {
          if (s instanceof MergedSuggest)
            s.delete(suggest);
        });
    }
    _onEdit() {
      if (!this._suggests.length) {
        return;
      }
      const [textBefore, textAfter, range] = editor.selection.getTextAround();
      if (!range) return;
      for (const suggest of this._suggests) {
        if (!suggest.canTrigger(textBefore, textAfter, range)) continue;
        this._currentSuggest = suggest;
        const { isMatched, query = "" } = suggest.findQuery(textBefore, textAfter, range);
        if (!isMatched) continue;
        suggest.show(range, query);
        break;
      }
    }
  };

  // vendor/workspace_core/src/ui/editor/link.ts
  var tryOpenUrl = editor.tryOpenUrl_ ? "tryOpenUrl_" : "tryOpenUrl";
  var MarkdownLinkWitoutExtension = class extends Component {
    constructor(settings = useService("settings")) {
      super();
      const SETTING_KEY = "mdLinkWithoutExtension";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    onload() {
      this.register(
        decorate.parameters(editor, tryOpenUrl, ([url, param1]) => {
          if (!(url.startsWith("#") || url.startsWith("http"))) {
            let [filepath, hash] = url.split("#");
            const ext = path_default.extname(filepath);
            if (!ext) {
              filepath += ".md";
            }
            url = filepath + (hash ? `#${hash}` : "");
          }
          return [url, param1];
        })
      );
    }
  };
  var OpenLinkInCurrentWin = class extends Component {
    constructor(settings = useService("settings")) {
      super();
      const SETTING_KEY = "openLinkInCurrentWin";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    onload() {
      this.register(
        decorate(editor, tryOpenUrl, (fn) => (url, param1) => {
          if (!(url.startsWith("#") || url.startsWith("http"))) {
            useService("app").openFile(decodeURIComponent(url));
            return;
          }
          return fn(url, param1);
        })
      );
    }
  };

  // vendor/workspace_core/src/ui/editor/markdown-editor.ts
  var MarkdownEditor = class extends Events {
    preProcessor = new MarkdownPreProcessor();
    postProcessor = new MarkdownPostProcessor();
    selection = new EditorSelection();
    suggestion = new EditorSuggestManager();
    _openLinkInCurrentWin;
    _markdownLinkWitoutExtension;
    constructor() {
      super("markdown-editor");
      bindPreProcessorToEditor(this);
      bindPostProcessorToEditor(this);
      blockMarkdownViewPreviewMode();
      setTimeout(() => {
        this._openLinkInCurrentWin = new OpenLinkInCurrentWin();
        this._markdownLinkWitoutExtension = new MarkdownLinkWitoutExtension();
      });
      until(() => editor.writingArea).then((el) => {
        this.emit("load", el);
        const observer = new MutationObserver(debounce(emitEdit.bind(this), 400));
        observer.observe(el, {
          characterData: true,
          childList: true,
          subtree: true
        });
        el.parentElement.addEventListener(
          "scroll",
          debounce(() => this.emit("scroll"), 200)
        );
      });
    }
    openFile(file) {
      const url = typeof file === "string" ? { pathname: file } : file;
      editor.library.openFile(url.pathname);
      if (url.hash) {
        setTimeout(() => editor.tryOpenUrl(url.hash), 500);
      }
    }
    getMarkdown() {
      return editor.getMarkdown();
    }
    setMarkdown(markdown2) {
      File.reloadContent(markdown2, false, true, false, true);
    }
  };
  function emitEdit(mutationsList) {
    if (!isEdited(mutationsList)) return;
    docNodeCount = editor.nodeMap.allNodes._set.length;
    this.emit("edit");
  }
  var docNodeCount = 0;
  function isEdited(mutationsList) {
    if (mutationsList.some((m) => m.type === "characterData"))
      return true;
    const first = mutationsList[0];
    if (mutationsList.length === 1 && // add first (remove last) char in a parargraph
    (first.addedNodes.length && first.removedNodes.length) || // add math in a parargraph
    matchElement(first.target, ".md-math-tex")) return true;
    const rest = mutationsList.slice(0, -1);
    const [last] = mutationsList.slice(-1);
    if (rest.every((m) => matchElement(m.target, "span") && matchElement(last.target, ".md-focus"))) return true;
    return docNodeCount !== editor.nodeMap.allNodes._set.length;
  }
  function matchElement(node, selector) {
    return isElement(node) && match(node, selector);
  }
  function isElement(node) {
    return node.nodeType === 1;
  }
  function match(el, selector) {
    if (selector.startsWith("."))
      return el.classList.contains(selector.slice(1));
    else
      return el.tagName === selector.toUpperCase();
  }

  // vendor/workspace_core/src/ui/editor/markdown-renderer.ts
  var OPTIONS = {
    mode: "text",
    readOnly: true,
    styleSelectedText: true,
    maxHighlightLength: 1 / 0,
    viewportMargin: 1 / 0,
    styleActiveLine: true,
    theme: " inner null-scroll",
    resetSelectionOnContextMenu: true,
    cursorScrollMargin: 60,
    dragDrop: false,
    scrollbarStyle: "null"
  };
  var FAKE_EDITOR = {
    sourceView: {
      inSourceMode: false
    },
    undo: {
      register() {
      },
      lastRegisteredOperationCommand() {
      }
    }
  };
  var MarkdownParser = memorize(() => editor.nodeMap.allNodes.first().__proto__.constructor);
  var MarkdownRenderer = class {
    constructor(mdEditor = useService("markdown-editor")) {
      this.mdEditor = mdEditor;
    }
    _cmInstances = /* @__PURE__ */ new WeakMap();
    /**
     * Render markdown in HTMLElement
     */
    renderTo(md, targetEl) {
      md = this.mdEditor.preProcessor.process("preload", md);
      const { frontMatter, content } = parseMarkdown(md);
      const frontMattersHtml = frontMatter ? `<pre mdtype="meta_block" class="md-meta-block md-end-block">${frontMatter}</pre>` : "";
      const [contentHtml] = MarkdownParser().parseFrom(content);
      targetEl.classList.add("typ-markdown-preview");
      targetEl.innerHTML = frontMattersHtml + contentHtml;
      $('[contenteditable="true"]', targetEl).attr("contenteditable", "false");
      $("pre.md-fences", targetEl).each((i, el) => {
        const code = el.innerText;
        el.innerHTML = "";
        const opts = {
          ...OPTIONS,
          // @ts-ignore
          mode: window.getCodeMirrorMode(el.getAttribute("lang")),
          lineWrapping: !File.option.noLineWrapping,
          lineNumbers: File.option.showLineNumbersForFence,
          indentUnit: File.option.codeIndentSize,
          tabSize: File.option.codeIndentSize
        };
        const cm = CodeMirror(el, opts, FAKE_EDITOR, uniqueId("cm"));
        cm.setValue(code);
        this._cmInstances.set(el, cm);
      });
      MathJax.typesetPromise($(".math-jax-preprocess", targetEl).toArray());
      this.mdEditor.postProcessor.processAll(targetEl);
    }
    /**
     * Get the `CodeMirror` instance of the codeblock rendered by the {@link MdPreviewerMode} in the `WorkspaceRoot`
     */
    getCodeMirrorInstance(cid) {
      const el = $(".typ-workspace-root").find(`[cid="${cid}"]`)[0];
      return this._cmInstances.get(el);
    }
  };

  // vendor/workspace_core/src/ui/settings/tabs/appearance-setting-tab.ts
  var DEFAULT_APPEARANCE_SETTINGS = {
    showNotSupportedFile: false,
    keepSearchResult: false,
    showSearchResultFullPath: false,
    advancedSearchMode: false,
    showRibbon: true
  };

  // vendor/workspace_core/src/ui/settings/tabs/file-link-setting-tab.ts
  var DEFAULT_FILE_LINK_SETTINGS = {
    openLinkInCurrentWin: true,
    mdLinkWithoutExtension: false,
    quickOpenInCurrentWin: true,
    ignoreFile: true,
    ignoreFileGlob: ".git"
  };

  // vendor/workspace_core/src/ui/sidebar/file-explorer.ts
  var FileExplorer = class _FileExplorer extends InternalSidebarPanel {
    constructor(i18n = useService("i18n"), vault = useService("vault")) {
      super();
      this.i18n = i18n;
      this.vault = vault;
      this.containerEl = document.getElementById("file-library");
      this.addRibbonButton({
        [BUILT_IN]: true,
        id: _FileExplorer.id,
        title: i18n.t.ribbon.files,
        icon: html`<i class="fa fa-folder-o"></i>`
      });
      setTimeout(() => this.ribbon.activeButton(_FileExplorer.id));
    }
    static get id() {
      return "core.file-explorer";
    }
    _contextmenu = new InternalContextMenu("#file-menu");
    _showNotSupportedFile = new ShowNotSupportedFile();
    onshow() {
      editor.library.fileSearch.hide();
      editor.library.switch("", true);
    }
    onhide() {
      $("#typora-sidebar").removeClass("active-tab-files");
    }
    _onContextMenu(callback) {
      $(this.containerEl).on("mousedown", (event) => {
        if (event.button === 2) {
          const path2 = event.target.closest(".file-library-node")?.getAttribute("data-path") ?? this.vault.path;
          this._contextmenu.removeExtendedMenuItem();
          callback({ menu: this._contextmenu, path: path2 });
        }
      });
    }
  };
  var ShowNotSupportedFile = class extends Component {
    constructor(settings = useService("settings")) {
      super();
      const SETTING_KEY = "showNotSupportedFile";
      if (settings.get(SETTING_KEY)) {
        this.load();
      }
      settings.onChange(SETTING_KEY, (_, isEnabled) => {
        isEnabled ? this.load() : this.unload();
      });
    }
    onload() {
      File.SupportedFiles.indexOf = () => 1;
      $(document).on("drop", () => {
        delete File.SupportedFiles.indexOf;
      }).on("mouseup", () => {
        File.SupportedFiles.indexOf = () => 1;
      });
      this.register(
        decorate(editor.library, "openFile", (fn) => (file, callback) => {
          const ext = path_default.extname(file).slice(1);
          if (ext && !File.SupportedFiles.includes(ext)) {
            useService("app").openFileWithDefaultApp(file);
            return;
          }
          fn(file, callback);
        })
      );
    }
    onunload() {
      delete File.SupportedFiles.indexOf;
    }
  };

  // vendor/workspace_core/src/ui/layout/tabs/index.ts
  var WorkspaceTabs = class extends WorkspaceParent {
    type = "tabs";
    tabHeader = new FileTabContainer({
      className: "typ-workspace-tab-header",
      onToggle: (tabId, tabEl) => {
        const leaf = this.toggleTab(tabId, tabEl);
        const [, setActiveLeaf] = useActiveLeaf();
        setActiveLeaf(leaf);
      },
      onClose: (tabId, tabEl) => this.removeTab(tabId, tabEl)
    });
    tabContentEl;
    constructor() {
      super();
      $(this.containerEl).addClass("typ-workspace-tabs").append(this.tabHeader.containerEl).append(this.tabContentEl = $('<div class="typ-workspace-tab-content">')[0]);
    }
    insertChild(index, child) {
      this.tabHeader.insertTab(index, child.state.path ? new FileTab(child.state.path) : new UntitledTab());
      super.insertChild(index, child);
      this.toggleTab(child.state.path);
      if (!child.state.path?.startsWith(`typ://${EmptyView.type}`)) {
        const empty_leaf = this.children.find((node) => node !== child && node.state.path?.startsWith(`typ://${EmptyView.type}`));
        if (empty_leaf) this.removeChild(empty_leaf);
      }
    }
    _insertChildEl(index, child) {
      this.tabContentEl.querySelector(".mod-active")?.classList.remove("mod-active");
      child.containerEl.classList.add("mod-active");
      this.tabContentEl.insertBefore(child.containerEl, this.tabContentEl.children[index]);
    }
    removeChild(child) {
      this.removeTab(child.state.path);
    }
    // --------- Tab Operators ---------
    _activeLeaf;
    get activeLeaf() {
      return this._activeLeaf ?? this.children[0];
    }
    toggleTab(path2, tabEl) {
      this.activeLeaf.view.close();
      this.tabContentEl.querySelector(".mod-active")?.classList.remove("mod-active");
      tabEl ??= this.tabHeader.getTabById(path2);
      this.tabHeader.activeTab(tabEl);
      const leaf = this.children.find((c) => c.state.path === path2);
      leaf.containerEl.classList.add("mod-active");
      leaf.view.open();
      this._activeLeaf = leaf;
      this.emit("tab:toggle", leaf);
      return leaf;
    }
    renameTab(oldPath, newPath) {
      const tabEl = this.tabHeader.getTabById(oldPath);
      const newTab = new FileTab(newPath);
      this.tabHeader.renameTab(tabEl, newTab);
      const leaf = this.children.find((c) => c.state.path === oldPath);
      leaf.state.path = newPath;
      leaf.view.setIcon(leaf.view.icon);
    }
    removeTab(path2, tabEl) {
      tabEl ??= this.tabHeader.getTabById(path2);
      if (!tabEl) return;
      this.tabHeader.closeTab(tabEl);
      const leaf = this.children.find((c) => c.state.path === path2);
      leaf.view.close();
      super.removeChild(leaf);
      if (!this.children.length) {
        if (this.getRoot() !== this.parent || this.parent.children.length > 1) {
          this.parent.removeChild(this);
        } else {
          this.appendChild(createEmptyLeaf());
        }
      }
    }
    removeOthers(path2) {
      const leaf = this.toggleTab(path2);
      this.tabHeader.closeOtherTabs(this.tabHeader.getTabById(path2));
      return leaf;
    }
    removeRight(path2) {
      const leaf = this.toggleTab(path2);
      this.tabHeader.closeRightTabs(this.tabHeader.getTabById(path2));
      return leaf;
    }
  };

  // vendor/workspace_core/src/metadata/metadata-manager.ts
  var IndexAbortedError = class extends Error {
    constructor() {
      super("Indexing process was aborted.");
      this.name = "IndexAbortedError";
    }
  };
  var MetadataProviderContext = class {
    constructor(filePath, textContent) {
      this.filePath = filePath;
      this.textContent = textContent;
    }
    text() {
      return this.textContent ? Promise.resolve(this.textContent) : filesystem_default.readText(this.filePath).then((text) => this.textContent = text);
    }
  };
  var DB_SCHEMA = {
    files: "path, metadata"
  };
  var MetadataManager = class extends StickyEvents {
    /**
     * @param options.concurrency Number of files processed simultaneously, default 10
     */
    constructor(options = {}, editor2 = useService("markdown-editor"), workspace = useService("workspace"), vault = useService("vault")) {
      super("metadata");
      this.vault = vault;
      this.concurrencyLimit = options.concurrency ?? 10;
      this.setSticky("index:done");
      workspace.on("file:will-save", (file) => {
        this.processFile(this.cache, this.vault.path, file, editor2.getMarkdown()).then(() => {
          const relativePath = path_default.relative(this.vault.path, file);
          this.emit("index:update", relativePath);
        }).catch(() => {
        });
      });
    }
    providers = {};
    cache = {};
    concurrencyLimit;
    isIndexing = false;
    /**
     * Register a metadata provider for file extension
     */
    register(extension, provider) {
      const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
      if (!this.providers[ext]) this.providers[ext] = [];
      this.providers[ext].push(provider);
    }
    /**
     * Index files in the vault
     */
    async index() {
      if (this.isIndexing) {
        throw new Error("Indexing is already in progress.");
      }
      this.isIndexing = true;
      console.log("[Metadata] Start indexing...");
      const abortController = new AbortController();
      const dispose = this.vault.on("change", () => abortController.abort());
      try {
        const { signal } = abortController;
        const vaultPath = this.vault.path;
        const allFiles = await filesystem_default.listFiles(vaultPath, { recursive: true, signal });
        this.emit("index:start", allFiles.length);
        signal.throwIfAborted();
        const vaultId = this.vault.id;
        const indexingCache = await this.loadFromIndexedDb(vaultId);
        signal.throwIfAborted();
        await this.processQueue(indexingCache, vaultPath, allFiles, signal);
        this.cache = indexingCache;
        this.emit("index:done");
        this.saveToIndexedDb(vaultId, indexingCache);
      } catch (error) {
        if (error.name === "AbortError") {
          console.log("[Metadata] Indexing stopped, temporary cache discarded");
        } else {
          console.error("[Metadata] Indexing failed due to error:", error);
          throw error;
        }
      } finally {
        this.isIndexing = false;
        dispose();
        console.log("[Metadata] Indexing completed.");
      }
    }
    async processQueue(indexingCache, vaultPath, filePaths, signal) {
      const allCount = filePaths.length;
      const worker = async () => {
        while (filePaths.length > 0) {
          signal.throwIfAborted();
          const filePath = filePaths.pop();
          if (filePath) {
            await this.processFile(indexingCache, vaultPath, filePath, void 0, signal);
            this.emit("index:progress", allCount - filePaths.length - 1);
          }
        }
      };
      const count = Math.min(this.concurrencyLimit, filePaths.length);
      const workers = Array.from({ length: count }, () => worker());
      await Promise.all(workers);
    }
    /**
     * Process a single file: with cache check and providers
     */
    async processFile(indexingCache, vaultPath, filePath, content, signal) {
      signal?.throwIfAborted();
      const ext = path_default.extname(filePath).toLowerCase();
      const providers = this.providers[ext];
      if (!providers || providers.length === 0) return;
      try {
        const stats = await filesystem_default.stat(filePath);
        const mtime = stats.mtimeMs;
        const relativePath = path_default.relative(vaultPath, filePath);
        const cached = this.cache[relativePath];
        if (!content && cached && cached.mtime === mtime) {
          indexingCache[relativePath] = cached;
          return;
        }
        const context = new MetadataProviderContext(filePath, content);
        const results = await Promise.all(
          providers.map(async (p) => {
            signal?.throwIfAborted();
            try {
              return await p(context);
            } catch (e) {
              console.warn(`Provider error in ${filePath}:`, e);
              return {};
            }
          })
        );
        signal?.throwIfAborted();
        const mergedMetadata = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
        indexingCache[relativePath] = {
          mtime,
          metadata: mergedMetadata
        };
      } catch (error) {
        if (error instanceof IndexAbortedError) throw error;
        console.error(`Failed to process ${filePath}:`, error);
      }
    }
    /**
     * Get metadata for a file by relative path.
     */
    get(relativePath) {
      return this.cache[relativePath];
    }
    /**
     * Clear all cache
     */
    clear() {
      this.cache = {};
    }
    async loadFromIndexedDb(vaultId) {
      const loadedCache = {};
      try {
        const db = new MiniDexie(`metadata:${vaultId}`).version(1).stores(DB_SCHEMA);
        const records = await db.files.toArray();
        for (const record of records) {
          const { path: path2, metadata } = record;
          loadedCache[path2] = metadata;
        }
        console.log(`[Metadata] Loaded ${records.length} items from IndexedDB.`);
      } catch (e) {
        console.error("[Metadata] Failed to load IndexedDB:", e);
      } finally {
        return loadedCache;
      }
    }
    async saveToIndexedDb(vaultId, cache) {
      try {
        const db = new MiniDexie(`metadata:${vaultId}`).version(1).stores(DB_SCHEMA);
        const rows = Object.entries(cache).map(([filePath, metadata]) => ({
          path: filePath,
          metadata
        }));
        await db.files.bulkPut(rows);
        console.log(`[Metadata] Saved ${rows.length} items to IndexedDB.`);
      } catch (e) {
        console.error("[Metadata] Failed to save IndexedDB:", e);
      }
    }
  };

  // vendor/workspace_core/src/metadata/metadata-providers.ts
  function registerDefaultMetadataProviders(metadata) {
    metadata.register("md", markdown);
  }
  var markdown = async (ctx) => {
    const md = await ctx.text();
    const { frontMatter, content, startLine, contentStartLine } = parseMarkdown(md);
    const frontmatter = parseSimplifiedYAML(frontMatter);
    const tags = parseTagsWithPositionsFromYAML(frontMatter, startLine);
    const titles = parseTitles(content, contentStartLine);
    return { frontmatter, tags, titles };
  };

  // vendor/workspace_core/src/settings/workspace-defaults.ts
  var DEFAULT_WORKSPACE_SETTINGS = {
    hideExtensionInFileTab: false,
    useBlankNewTab: false,
    useAutoSwap: true,
    rightSplitWidth: 280
  };

  // vendor/workspace_core/src/setup.ts
  if (false) {
    const colorMap = { "enter": "#2196f3", "exit": "#4caf50", "error": "#f44336" };
    ServiceLogger.onLog((entry) => {
      console.groupCollapsed(
        `%c${entry.scope}%c ${entry.method}%c${entry.displayArgs ?? ""}${entry.ms != null ? ` +${entry.ms.toFixed(2)}ms` : ""}`,
        "color:#fff;background:#555;padding:1px 4px;border-radius:3px;",
        `color:${colorMap[entry.direction]};font-weight:bold;`,
        "color:#888;"
      );
      console.groupEnd();
    });
  }
  registerService("logger", memorize(([scope]) => new Logger(scope)));
  registerService("app", memorize(() => new App()));
  registerService(
    "env",
    () => (
      // @ts-ignore
      window[Symbol.for(`${"typora-code:workspace"}:env`)] ?? {}
    )
  );
  registerService("command-manager", memorize(() => new CommandManager()));
  registerService("exporter", memorize(() => new ExportManager()));
  registerService("hotkey-manager", memorize(() => new HotkeyManager()));
  registerService("i18n", memorize(() => {
    const i18n = new I18n({
      localePath: path_default.join(coreDir(), "locales"),
      userLang: useService("settings").get("displayLang")
    });
    DEFAULT_OPTIONS.userLang = i18n.locale;
    return i18n;
  }));
  registerService("input-box", memorize(() => new InputBox()));
  registerService("quick-pick", memorize(() => new QuickPick()));
  registerService("vault", memorize(() => new Vault()));
  registerService("config-repository", memorize(() => new ConfigRepository()));
  registerService("settings", memorize(() => {
    const settings = new Settings({
      filename: "workspace",
      version: 1
    });
    settings.setDefault(DEFAULT_FILE_LINK_SETTINGS);
    settings.setDefault(DEFAULT_APPEARANCE_SETTINGS);
    settings.setDefault(DEFAULT_RIBBON_SETTINGS);
    settings.setDefault(DEFAULT_WORKSPACE_SETTINGS);
    return settings;
  }));
  registerService("view-manager", memorize(() => new ViewManager()));
  registerService("workspace", memorize(() => new Workspace()));
  registerService("markdown-editor", memorize(() => new MarkdownEditor()));
  registerService("markdown-renderer", memorize(() => new MarkdownRenderer()));
  registerService("ribbon", memorize(() => new WorkspaceRibbon()));
  registerService("file-explorer", memorize(() => new FileExplorer()));
  registerService("sidebar", memorize(() => useService("workspace").sidebar));
  registerService("notice", ([message, delay]) => new Notice(message, delay));
  registerService("workspace-root", memorize(() => useService("workspace").rootSplit));
  registerService("workspace-floating", memorize(() => useService("workspace").floatingSplit));
  registerService("workspace-split", ([direction]) => new WorkspaceSplit(direction));
  registerService("workspace-tabs", () => new WorkspaceTabs());
  registerService("metadata-manager", memorize(() => {
    const metadata = new MetadataManager();
    registerDefaultMetadataProviders(metadata);
    return metadata;
  }));

  // vendor/workspace_core/src/runtime.ts
  async function initialize() {
    const app = useService("app");
    app.initialize();
    const started = Date.now();
    while (!app.workspace.rootSplit.containerEl.isConnected || !app.workspace.sidebar.panels?.length) {
      if (Date.now() - started > 15e3) throw new Error("Typora Code workspace mount timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    app.start();
    return app;
  }
  return __toCommonJS(runtime_exports);
})();

await workspace_core_module.initialize();resolve_ready();})().catch(error=>{document.documentElement.dataset.typoraCodeStartup='error';console.error(error);reject_ready(error);});})();