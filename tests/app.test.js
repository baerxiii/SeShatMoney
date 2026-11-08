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
        elements.set(id, {
          innerHTML: "",
          textContent: "",
          style: {},
          value: "",
          querySelector: () => ({ focus() {} })
        });
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
  assert.match(document.getElementById("modalTitle").textContent, /Add Account/);
  assert.match(document.getElementById("modalContent").innerHTML, /accountName/);
  assert.equal(document.getElementById("modalOverlay").style.display, "flex");

  context.showAddBudgetModal();
  assert.match(document.getElementById("modalTitle").textContent, /Add Budget Category/);
  assert.match(document.getElementById("modalContent").innerHTML, /budgetName/);

  assert.equal(alerts.length, 0);
  assert.doesNotMatch(fs.readFileSync("index.html", "utf8"), /showAddBillModal|Upcoming Bills/);
});

test("monthly totals use budgeted category spending and transaction filters", () => {
  const { context } = loadApp();
  assert.equal(context.escapeHTML(`<img src=x onerror="bad">`),
    "&lt;img src=x onerror=&quot;bad&quot;&gt;");
  const totals = context.calculateMonthlyTotals([
    { amount: 2400, category: "Income" },
    { amount: -125, category: "Groceries" },
    { amount: -50, category: "Dining" },
    { amount: -40, category: "Utilities" }
  ], [
    { category_name: "groceries", monthly_budget: 300 },
    { category_name: "Dining", monthly_budget: 100 }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), {
    income: 2400,
    spending: 215,
    totalBudget: 400,
    budgetedSpending: 175,
    remainingBudget: 225
  });

  const filtered = context.filterTransactions([
    { description: "Market", category: "Groceries", transaction_date: "2026-06-02" },
    { description: "Coffee", category: "Dining", transaction_date: "2026-06-03" },
    { description: "Market", category: "Groceries", transaction_date: "2026-05-30" }
  ], {
    search: "MARK",
    category: "Groceries",
    period: "month",
    monthStart: "2026-06-01"
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].transaction_date, "2026-06-02");
});

test("transfer and transaction writes use atomic database functions", async () => {
  const calls = [];
  const { context, document } = loadApp();
  context.window.seshat.supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    }
  };
  context.refreshDashboard = async () => {};
  for (const [id, value] of Object.entries({
    fromAccount: "1",
    toAccount: "2",
    transferAmount: "25.50",
    transactionDescription: "Pay day",
    transactionAmount: "1200",
    transactionType: "Income",
    transactionCategory: "Other",
    transactionAccount: "1",
    transactionDate: "2026-06-01"
  })) {
    document.getElementById(id).value = value;
  }

  await context.saveTransfer();
  await context.saveTransaction();
  assert.deepEqual(calls.map(call => call.name), [
    "transfer_money_between_accounts",
    "save_money_transaction"
  ]);
  assert.equal(calls[0].args.p_amount, 25.5);
  assert.equal(calls[1].args.p_amount, 1200);
  assert.equal(calls[1].args.p_transaction_id, null);
});
