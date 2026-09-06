export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !specifier.endsWith(".js") && !specifier.endsWith(".json")) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      try {
        // Workspace packages export TypeScript source during tests.  Node 24
        // can strip types, but it still requires an explicit file target.
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        try {
          return await nextResolve(`${specifier}/index.js`, context);
        } catch {
          try {
            return await nextResolve(`${specifier}/index.ts`, context);
          } catch {
            return nextResolve(specifier, context);
          }
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
