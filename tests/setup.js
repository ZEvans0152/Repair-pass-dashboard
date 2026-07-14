// Backend functions run on Deno. Stub the Deno globals so their entry.ts
// modules can be imported under Node for unit testing — Deno.serve becomes a
// no-op, so importing a function module does not start a server.
globalThis.Deno = {
  serve: () => {},
  env: { get: () => undefined },
};
