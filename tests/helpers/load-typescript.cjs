const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
// Transpile only in memory. No build artifact, database or framework process is needed.
module.exports = function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (!name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
    return load(path.resolve(path.dirname(file), `${name}.ts`));
  }, Date, Intl, Set, Map, console }, { filename: file });
  return exports;
};
