const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function setup(initialSession = null) {
  const elements = new Map();
  const handlers = {};
  const document = {
    addEventListener(type, handler) { handlers[type] = handler; },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          value: "",
          textContent: "",
          hidden: false,
          disabled: false,
          style: {},
          classList: { toggle() {} },
          setAttribute() {},
          replaceChildren() {},
          addEventListener(type, handler) { this[type] = handler; }
        });
      }
      return elements.get(id);
    }
  };
  let session = initialSession;
  let callback;
  let credentials;
  let signInError = null;
  let signOutOptions;
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session?.user || null }, error: null }),
    signInWithPassword: async input => {
      credentials = input;
      if (signInError) return { error: signInError };
      session = { user: { id: "1", email: input.email } };
      return { error: null };
    },
    signOut: async options => { signOutOptions = options; session = null; return { error: null }; },
    onAuthStateChange: fn => { callback = fn; }
  };
  const context = {
    document,
    window: { seshat: { supabase: { auth } } },
    alert() {},
    console: { error() {} },
    setTimeout
  };
  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);
  let loads = 0;
  context.refreshDashboard = async () => { loads++; };
  return {
    context, document, handlers,
    get loads() { return loads; },
    get credentials() { return credentials; },
    get signOutOptions() { return signOutOptions; },
    setSignInError(error) { signInError = error; },
    emit(event) { callback(event); }
  };
}

test("existing Hub session opens Money without entering credentials", async () => {
  const app = setup({ user: { id: "1", email: "editor@example.test" } });
  await app.handlers.DOMContentLoaded();
  assert.equal(app.document.getElementById("moneyDashboard").hidden, false);
  assert.equal(app.document.getElementById("authScreen").hidden, true);
  assert.equal(app.document.getElementById("signedInEmail").textContent, "editor@example.test");
  assert.equal(app.loads, 1);
  assert.equal(app.credentials, undefined);
});

test("signed-out user can sign in directly and sign out", async () => {
  const app = setup();
  await app.handlers.DOMContentLoaded();
  assert.equal(app.document.getElementById("moneyDashboard").hidden, true);
  assert.equal(app.document.getElementById("signInButton").disabled, false);
  app.document.getElementById("authEmail").value = "  editor@example.test  ";
  app.document.getElementById("authPassword").value = "test-password";
  let prevented = false;
  await app.document.getElementById("signInForm").submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.credentials.email, "editor@example.test");
  assert.equal(app.document.getElementById("authPassword").value, "");
  assert.equal(app.document.getElementById("moneyDashboard").hidden, false);
  await app.document.getElementById("signOutButton").click();
  assert.equal(app.signOutOptions.scope, "local");
  assert.equal(app.document.getElementById("moneyDashboard").hidden, true);
  assert.match(app.document.getElementById("authStatus").textContent, /also signs you out/);
});

test("a session change hides the old dashboard before checking the new account", async () => {
  const app = setup({ user: { id: "1", email: "editor@example.test" } });
  await app.handlers.DOMContentLoaded();
  app.emit("SIGNED_IN");
  assert.equal(app.document.getElementById("moneyDashboard").hidden, true);
  assert.equal(app.document.getElementById("signedInEmail").textContent, "");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(app.document.getElementById("moneyDashboard").hidden, false);
});

test("sign-in errors are visible and cross-tab sign-out hides private data", async () => {
  const app = setup();
  await app.handlers.DOMContentLoaded();
  app.setSignInError(new Error("Invalid login credentials"));
  await app.document.getElementById("signInForm").submit({ preventDefault() {} });
  assert.match(app.document.getElementById("authStatus").textContent, /Invalid login credentials/);
  assert.equal(app.document.getElementById("signInButton").disabled, false);

  app.document.getElementById("moneyDashboard").hidden = false;
  app.emit("SIGNED_OUT");
  assert.equal(app.document.getElementById("moneyDashboard").hidden, true);
  assert.equal(app.document.getElementById("authScreen").hidden, false);
  assert.equal(app.document.getElementById("signedInEmail").textContent, "");
});

test("late session validation cannot reopen the dashboard after sign-out", async () => {
  const app = setup({ user: { id: "1", email: "editor@example.test" } });
  await app.handlers.DOMContentLoaded();
  let release;
  app.context.refreshDashboard = () => new Promise(resolve => { release = resolve; });
  const pending = app.context.checkSession();
  await new Promise(resolve => setImmediate(resolve));
  app.emit("SIGNED_OUT");
  release();
  await pending;
  assert.equal(app.document.getElementById("moneyDashboard").hidden, true);
});
