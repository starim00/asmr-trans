const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();

function loadTsModule(relativePath) {
  const normalizedPath = relativePath.endsWith(".ts") ? relativePath : `${relativePath}.ts`;
  const sourcePath = path.join(__dirname, "..", normalizedPath);
  if (cache.has(sourcePath)) {
    return cache.get(sourcePath).exports;
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });

  const moduleContext = { exports: {} };
  cache.set(sourcePath, moduleContext);
  const loadModule = new Function("module", "exports", "require", compiled.outputText);
  loadModule(moduleContext, moduleContext.exports, (request) => {
    if (request.startsWith("./") || request.startsWith("../")) {
      const resolvedPath = path.join(path.dirname(normalizedPath), request);
      return loadTsModule(resolvedPath);
    }
    return require(request);
  });
  return moduleContext.exports;
}

module.exports = { loadTsModule };
