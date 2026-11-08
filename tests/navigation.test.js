const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function setup() {
  const sections = ["overview", "accounts", "transactions", "budgets", "transfers"];
  const elements = new Map();
  for (const section of sections) {
    const listeners = {};
    elements.set(`tab-${section}`, {
      listeners,
      attributes: {},
      tabIndex: section === "overview" ? 0 : -1,
      addEventListener(type, handler) { listeners[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; }
    });
    elements.set(`panel-${section}`, { hidden: section !== "overview" });
  }
  const document = {
    addEventListener() {},
    getElementById(id) { return elements.get(id); }
  };
  const context = { document };
  vm.runInNewContext(fs.readFileSync("app.js", "utf8"), context);
  context.initializeSections();
  return { sections, elements, context };
}

test("each section button switches exactly one panel and its selected state", () => {
  const { sections, elements } = setup();
  for (const section of sections) {
    elements.get(`tab-${section}`).listeners.click();
    for (const item of sections) {
      assert.equal(elements.get(`panel-${item}`).hidden, item !== section);
      assert.equal(elements.get(`tab-${item}`).attributes["aria-selected"], String(item === section));
      assert.equal(elements.get(`tab-${item}`).tabIndex, item === section ? 0 : -1);
    }
  }
});

test("arrow, Home and End keys navigate and focus tabs", () => {
  const { elements } = setup();
  let prevented = false;
  const press = (section, key) => elements.get(`tab-${section}`).listeners.keydown({
    key, preventDefault() { prevented = true; }
  });
  press("overview", "ArrowLeft");
  assert.equal(prevented, true);
  assert.equal(elements.get("panel-transfers").hidden, false);
  assert.equal(elements.get("tab-transfers").focused, true);
  press("transfers", "Home");
  assert.equal(elements.get("panel-overview").hidden, false);
  press("overview", "End");
  assert.equal(elements.get("panel-transfers").hidden, false);
  press("transfers", "ArrowRight");
  assert.equal(elements.get("panel-overview").hidden, false);
});

test("markup connects each tab to its panel and retains every action", () => {
  const html = fs.readFileSync("index.html", "utf8");
  for (const section of ["overview", "accounts", "transactions", "budgets", "transfers"]) {
    assert.match(html, new RegExp(`id="tab-${section}" role="tab"[^>]*aria-controls="panel-${section}"`));
    assert.match(html, new RegExp(`id="panel-${section}" role="tabpanel" aria-labelledby="tab-${section}"`));
  }
  for (const action of ["showAddAccountModal", "showAddTransactionModal", "showAddBudgetModal", "showTransferModal"]) {
    assert.match(html, new RegExp(`onclick="${action}\\(\\)"`));
  }
});
