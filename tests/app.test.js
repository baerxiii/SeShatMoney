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

test("category budgets combine matching names and deduct expenses only", () => {
  const { context } = loadApp();
  const budgets = [
    { category_name: " Groceries ", monthly_budget: 100 },
    { category_name: "GROCERIES", monthly_budget: 50 },
    { category_name: "Dining", monthly_budget: 20 }
  ];
  const entries = [
    { category: "groceries", amount: -80 },
    { category: "GROCERIES ", amount: 25 },
    { category: "Dining", amount: -25 },
    { category: "Other", amount: -100 }
  ];
  const result = JSON.parse(JSON.stringify(context.calculateCategoryBudgets(budgets, entries)));
  assert.deepEqual(result, [
    { name: "Groceries", limit: 150, spent: 80, remaining: 70 },
    { name: "Dining", limit: 20, spent: 25, remaining: -5 }
  ]);
  const totals = context.calculateMonthlyTotals(entries, budgets);
  assert.equal(totals.remainingBudget, 65);
});

test("transaction form includes and escapes custom budget categories without duplicates", () => {
  const { context } = loadApp();
  const html = context.transactionFormMarkup("<option>Account</option>", null, [
    "groceries", "Pet care", "<img src=x>"
  ]);
  assert.equal((html.match(/>Groceries<\/option>/g) || []).length, 1);
  assert.match(html, />Pet care<\/option>/);
  assert.match(html, /&lt;img src=x&gt;/);
  const edited = context.transactionFormMarkup("", { id: 2, category: "pet CARE", amount: -5 }, ["Pet care"]);
  assert.match(edited, /<option selected>pet CARE<\/option>/);
  assert.equal((edited.match(/pet care/gi) || []).length, 1);
});

test("category display recalculates after expense saves, edits and deletes", async () => {
  const { context, document } = loadApp();
  class Element {
    constructor() { this.children = []; this.textContent = ""; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
  }
  document.createElement = () => new Element();
  const list = new Element();
  const originalGet = document.getElementById;
  document.getElementById = id => id === "budgetList" ? list : originalGet.call(document, id);

  const today = context.localDate();
  const entries = [
    { id: 1, category: "Pet care", amount: -20, transaction_date: today },
    { id: 2, category: "Pet care", amount: -999, transaction_date: "2000-01-01" }
  ];
  const budgets = [{ category_name: "Pet care", monthly_budget: 100 }];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from(table) {
      if (table === "budget_categories") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: budgets, error: null }) }) }) };
      }
      return { select: () => ({ eq: () => ({
        gte: (_field, start) => ({
          lte: async (_field2, end) => ({
            data: entries.filter(item => item.transaction_date >= start && item.transaction_date <= end),
            error: null
          })
        })
      }) }) };
    },
    rpc: async (name, args) => {
      if (name === "save_money_transaction") {
        const entry = entries.find(item => item.id === args.p_transaction_id);
        if (entry) Object.assign(entry, { amount: args.p_amount, category: args.p_category, transaction_date: args.p_transaction_date });
        else entries.push({ id: 3, amount: args.p_amount, category: args.p_category, transaction_date: args.p_transaction_date });
      } else {
        const index = entries.findIndex(item => item.id === args.p_transaction_id);
        entries.splice(index, 1);
      }
      return { error: null };
    }
  };
  context.window.seshat.supabase = client;
  context.refreshDashboard = () => context.loadBudgetCategories();
  const text = () => list.children[0].children.map(child => child.textContent).join(" | ");

  await context.loadBudgetCategories();
  assert.match(text(), /\$20\.00 spent of \$100\.00 planned.*\$80\.00 remaining/);
  for (const [id, value] of Object.entries({
    transactionDescription: "Vet", transactionAmount: "30", transactionType: "Expense",
    transactionCategory: "Pet care", transactionAccount: "1", transactionDate: today
  })) document.getElementById(id).value = value;
  await context.saveTransaction();
  assert.match(text(), /\$50\.00 spent.*\$50\.00 remaining/);
  document.getElementById("transactionAmount").value = "90";
  await context.saveTransaction(3);
  assert.match(text(), /\$110\.00 spent.*\$10\.00 over budget/);
  await context.deleteTransaction(3);
  assert.match(text(), /\$20\.00 spent.*\$80\.00 remaining/);
});
