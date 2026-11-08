const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadApp() {
  const elements = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, { innerHTML: "", style: {}, value: "" });
      }
      return elements.get(id);
    }
  };
  const alerts = [];
  const context = {
    document,
    window: { seshat: { supabase: {} } },
    alert: message => alerts.push(message),
    confirm: () => true,
    console
  };
  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);
  return { context, document, alerts };
}

test("all inline dashboard actions resolve to loaded functions", () => {
  const { context } = loadApp();
  const html = fs.readFileSync("index.html", "utf8");
  const actions = [...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)].map(match => match[1]);

  assert.ok(actions.length > 0);
  for (const action of actions) {
    assert.equal(typeof context[action], "function", `${action} must be available to inline button handlers`);
  }
});

test("account and budget buttons open their forms, and bill action is explicit", () => {
  const { context, document, alerts } = loadApp();
  context.showAddAccountModal();
  assert.match(document.getElementById("modalTitle").innerHTML, /Add Account/);
  assert.match(document.getElementById("modalContent").innerHTML, /accountName/);
  assert.equal(document.getElementById("modalOverlay").style.display, "flex");

  context.showAddBudgetModal();
  assert.match(document.getElementById("modalTitle").innerHTML, /Add Budget Category/);
  assert.match(document.getElementById("modalContent").innerHTML, /budgetName/);

  context.showAddBillModal();
  assert.match(alerts[0], /Bills coming next/);
});
