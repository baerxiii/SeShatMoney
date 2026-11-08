const ACCOUNT_TYPES = [
    "Checking", "Savings", "Credit Card", "Line of Credit",
    "Loan", "Mortgage", "Investment", "Cash"
];
const TRANSACTION_CATEGORIES = [
    "Groceries", "Fuel", "Dining", "Utilities", "Insurance",
    "Entertainment", "Debt Payment", "Savings", "Other"
];
let transactions = [];
let authRevision = 0;

function getSB() {
    if (!window.seshat?.supabase) {
        throw new Error("The sign-in service could not be loaded. Check your connection and reload.");
    }
    return window.seshat.supabase;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function currency(value) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD"
    }).format(Number(value) || 0);
}

function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getCurrentMonthStart(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function calculateMonthlyTotals(monthTransactions, budgets) {
    const income = monthTransactions.reduce((sum, item) =>
        sum + Math.max(Number(item.amount) || 0, 0), 0);
    const spending = monthTransactions.reduce((sum, item) =>
        sum + Math.abs(Math.min(Number(item.amount) || 0, 0)), 0);
    const budgetCategories = new Set(budgets.map(item =>
        String(item.category_name || "").trim().toLocaleLowerCase()));
    const budgetedSpending = monthTransactions.reduce((sum, item) => {
        const category = String(item.category || "").trim().toLocaleLowerCase();
        return budgetCategories.has(category)
            ? sum + Math.abs(Math.min(Number(item.amount) || 0, 0))
            : sum;
    }, 0);
    const totalBudget = budgets.reduce((sum, item) =>
        sum + Math.max(Number(item.monthly_budget) || 0, 0), 0);
    return {
        income,
        spending,
        totalBudget,
        budgetedSpending,
        remainingBudget: totalBudget - budgetedSpending
    };
}

function filterTransactions(items, { search, category, period, monthStart }) {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return items.filter(transaction => {
        const matchesSearch = [transaction.description, transaction.category]
            .some(value => String(value || "").toLocaleLowerCase().includes(normalizedSearch));
        const matchesCategory = !category || transaction.category === category;
        const matchesPeriod = period !== "month" ||
            String(transaction.transaction_date || "").startsWith(monthStart.slice(0, 7));
        return matchesSearch && matchesCategory && matchesPeriod;
    });
}

function showError(error) {
    console.error(error);
    alert(error.message || "Something went wrong. Please try again.");
}

async function getCurrentUser() {
    const { data: { user }, error } = await getSB().auth.getUser();
    if (error) throw error;
    return user;
}

async function checkSession() {
    const revision = ++authRevision;
    const signInButton = document.getElementById("signInButton");
    try {
        const { data: { session }, error } = await getSB().auth.getSession();
        if (error) throw error;
        if (!session) {
            if (revision !== authRevision) return false;
            showSignedOut("Sign in with your SeShat Hub account.");
            return false;
        }
        const user = await getCurrentUser();
        if (revision !== authRevision) return false;
        if (!user) {
            showSignedOut("Your session has expired. Please sign in again.");
            return false;
        }
        document.getElementById("authPassword").value = "";
        document.getElementById("signedInEmail").textContent = user.email || "Signed in";
        document.getElementById("authStatus").textContent = "Loading your dashboard…";
        await refreshDashboard();
        if (revision !== authRevision) return false;
        document.getElementById("authScreen").hidden = true;
        document.getElementById("moneyDashboard").hidden = false;
        return true;
    } catch (error) {
        if (revision !== authRevision) return false;
        console.error("Could not check the current session", error);
        showSignedOut(`Could not check your session: ${error.message || "Please try again."}`, true);
        return false;
    } finally {
        if (revision === authRevision) signInButton.disabled = false;
    }
}

function showSignedOut(message, isError = false) {
    document.getElementById("moneyDashboard").hidden = true;
    document.getElementById("authScreen").hidden = false;
    document.getElementById("authPassword").value = "";
    document.getElementById("signedInEmail").textContent = "";
    transactions = [];
    for (const id of ["accountsList", "budgetList", "transactionsList"]) {
        document.getElementById(id).replaceChildren();
    }
    for (const id of ["monthlyIncome", "monthlySpending", "remainingBudget", "accountCount"]) {
        document.getElementById(id).textContent = "—";
    }
    document.getElementById("budgetSummary").textContent = "";
    closeModal();
    const status = document.getElementById("authStatus");
    status.textContent = message;
    status.classList.toggle("error", isError);
}

async function signIn(event) {
    event.preventDefault();
    const button = document.getElementById("signInButton");
    const status = document.getElementById("authStatus");
    button.disabled = true;
    status.classList.toggle("error", false);
    status.textContent = "Signing in…";
    try {
        const { error } = await getSB().auth.signInWithPassword({
            email: document.getElementById("authEmail").value.trim(),
            password: document.getElementById("authPassword").value
        });
        if (error) throw error;
        document.getElementById("authPassword").value = "";
        await checkSession();
    } catch (error) {
        console.error("Sign-in failed", error);
        status.textContent = `Sign-in failed: ${error.message || "Please try again."}`;
        status.classList.toggle("error", true);
    } finally {
        button.disabled = false;
    }
}

async function signOut() {
    const button = document.getElementById("signOutButton");
    button.disabled = true;
    try {
        const { error } = await getSB().auth.signOut({ scope: "local" });
        if (error) throw error;
        ++authRevision;
        showSignedOut("Signed out. This also signs you out of SeShat Hub in this browser.");
    } catch (error) {
        showError(error);
    } finally {
        button.disabled = false;
    }
}

async function loadDashboard() {
    const revision = authRevision;
    const user = await getCurrentUser();
    if (!user) return;

    const start = getCurrentMonthStart();
    const end = localDate();
    const [accountResult, transactionResult, budgetResult] = await Promise.all([
        getSB().from("money_accounts")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
        getSB().from("money_transactions")
            .select("amount,category")
            .eq("user_id", user.id)
            .gte("transaction_date", start)
            .lte("transaction_date", end),
        getSB().from("budget_categories")
            .select("category_name,monthly_budget")
            .eq("user_id", user.id)
    ]);

    for (const result of [accountResult, transactionResult, budgetResult]) {
        if (result.error) throw result.error;
    }
    if (revision !== authRevision) return;

    const monthTransactions = transactionResult.data || [];
    const budgets = budgetResult.data || [];
    const totals = calculateMonthlyTotals(monthTransactions, budgets);

    document.getElementById("accountCount").textContent = accountResult.count || 0;
    document.getElementById("monthlyIncome").textContent = currency(totals.income);
    document.getElementById("monthlySpending").textContent = currency(totals.spending);
    document.getElementById("remainingBudget").textContent = currency(totals.remainingBudget);
    document.getElementById("budgetSummary").textContent = budgets.length
        ? `${currency(totals.totalBudget)} planned · ${currency(totals.budgetedSpending)} budgeted spend · negative means over plan`
        : "Add budget categories to track your monthly plan.";
}

function makeButton(text, className, handler, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    if (label) button.setAttribute("aria-label", label);
    button.addEventListener("click", handler);
    return button;
}

async function loadAccounts() {
    const revision = authRevision;
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await getSB()
        .from("money_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
    if (error) throw error;
    if (revision !== authRevision) return;

    const container = document.getElementById("accountsList");
    container.replaceChildren();
    if (!data?.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No accounts yet. Add one to get started.";
        container.appendChild(empty);
        return;
    }

    data.forEach(account => {
        const item = document.createElement("article");
        item.className = "list-item account-item";
        const name = document.createElement("strong");
        name.textContent = account.name;
        const description = document.createElement("p");
        description.textContent = account.type;
        const balance = document.createElement("strong");
        balance.className = "account-balance";
        balance.textContent = currency(account.balance);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(
            "Delete", "text-button danger-button",
            () => deleteAccount(account.id), `Delete ${account.name}`
        ));
        item.append(name, description, balance, actions);
        container.appendChild(item);
    });
}

async function deleteAccount(id) {
    if (!confirm("Delete this account? Accounts with transactions may not be deletable.")) return;
    try {
        const { error } = await getSB().from("money_accounts").delete().eq("id", id);
        if (error) throw error;
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

function openModal(title, content) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalContent").innerHTML = content;
    const overlay = document.getElementById("modalOverlay");
    overlay.style.display = "flex";
    overlay.querySelector("input, select, button")?.focus();
}

function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
}

function showAddAccountModal() {
    const options = ACCOUNT_TYPES.map(type =>
        `<option>${escapeHTML(type)}</option>`).join("");
    openModal("🏦 Add Account", `
        <label for="accountName">Account name</label>
        <input id="accountName" maxlength="80" placeholder="e.g. Main chequing">
        <label for="accountType">Account type</label>
        <select id="accountType">${options}</select>
        <label for="accountBalance">Opening balance</label>
        <input id="accountBalance" type="number" step="0.01" value="0">
        <div class="modal-actions"><button class="btn" onclick="saveAccount()">Save account</button></div>
    `);
}

async function saveAccount() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Authentication required.");
        const name = document.getElementById("accountName").value.trim();
        const type = document.getElementById("accountType").value;
        const balanceInput = document.getElementById("accountBalance").value;
        const balance = Number(balanceInput);
        if (!name) throw new Error("Enter an account name.");
        if (!Number.isFinite(balance)) throw new Error("Enter a valid opening balance.");
        const { error } = await getSB().from("money_accounts").insert({
            user_id: user.id,
            name,
            type,
            balance: type === "Credit Card" ? -Math.abs(balance) : balance
        });
        if (error) throw error;
        closeModal();
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

async function loadTransactions() {
    const revision = authRevision;
    const user = await getCurrentUser();
    if (!user) return;
    const { data, error } = await getSB()
        .from("money_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false });
    if (error) throw error;
    if (revision !== authRevision) return;
    transactions = data || [];
    updateCategoryFilter();
    renderTransactions();
}

function updateCategoryFilter() {
    const filter = document.getElementById("transactionCategoryFilter");
    const selected = filter.value;
    const categories = [...new Set(transactions.map(item => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    filter.replaceChildren(new Option("All categories", ""));
    categories.forEach(category => filter.add(new Option(category, category)));
    if (categories.includes(selected)) filter.value = selected;
}

function renderTransactions() {
    const container = document.getElementById("transactionsList");
    const search = document.getElementById("transactionSearch").value;
    const category = document.getElementById("transactionCategoryFilter").value;
    const period = document.getElementById("transactionPeriodFilter").value;
    const currentMonth = getCurrentMonthStart();
    const filtered = filterTransactions(transactions, { search, category, period, monthStart: currentMonth });

    container.replaceChildren();
    if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = transactions.length ? "No transactions match these filters." : "No transactions yet.";
        container.appendChild(empty);
        return;
    }

    filtered.forEach(transaction => {
        const amount = Number(transaction.amount) || 0;
        const item = document.createElement("article");
        item.className = "list-item transaction-item";
        const copy = document.createElement("div");
        copy.className = "transaction-copy";
        const title = document.createElement("strong");
        title.textContent = transaction.description;
        const meta = document.createElement("p");
        meta.textContent = [
            transaction.category || "Uncategorized",
            transaction.transaction_date || ""
        ].filter(Boolean).join(" · ");
        copy.append(title, meta);
        const amountElement = document.createElement("strong");
        amountElement.className = amount >= 0 ? "amount-positive" : "amount-negative";
        amountElement.textContent = currency(amount);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.append(
            makeButton("Edit", "text-button", () => showEditTransactionModal(transaction)),
            makeButton("Delete", "text-button danger-button", () => deleteTransaction(transaction.id))
        );
        item.append(copy, amountElement, actions);
        container.appendChild(item);
    });
}

async function deleteTransaction(id) {
    if (!confirm("Delete this transaction and reverse its account balance change?")) return;
    try {
        const { error } = await getSB().rpc("delete_money_transaction", {
            p_transaction_id: id
        });
        if (error) throw error;
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

async function getAccountOptions(selectedId) {
    const user = await getCurrentUser();
    if (!user) throw new Error("Authentication required.");
    const { data, error } = await getSB().from("money_accounts")
        .select("id,name")
        .eq("user_id", user.id)
        .order("name");
    if (error) throw error;
    if (!data?.length) throw new Error("Add an account before recording a transaction.");
    return data.map(account =>
        `<option value="${escapeHTML(account.id)}" ${String(account.id) === String(selectedId) ? "selected" : ""}>${escapeHTML(account.name)}</option>`
    ).join("");
}

function transactionFormMarkup(accounts, transaction = null) {
    const amount = transaction ? Math.abs(Number(transaction.amount) || 0) : "";
    const selectedCategory = transaction?.category || TRANSACTION_CATEGORIES[0];
    const categories = [...new Set([...TRANSACTION_CATEGORIES, selectedCategory])];
    return `
        <label for="transactionDescription">Description</label>
        <input id="transactionDescription" maxlength="120" value="${escapeHTML(transaction?.description || "")}" placeholder="e.g. Grocery shopping">
        <div class="form-row">
            <div><label for="transactionAmount">Amount</label><input id="transactionAmount" type="number" min="0.01" step="0.01" value="${escapeHTML(amount)}" placeholder="0.00"></div>
            <div><label for="transactionType">Type</label><select id="transactionType">
                <option ${!transaction || Number(transaction.amount) < 0 ? "selected" : ""}>Expense</option>
                <option ${transaction && Number(transaction.amount) >= 0 ? "selected" : ""}>Income</option>
            </select></div>
        </div>
        <label for="transactionCategory">Category</label>
        <select id="transactionCategory">${categories.map(item =>
            `<option ${item === selectedCategory ? "selected" : ""}>${escapeHTML(item)}</option>`
        ).join("")}</select>
        <label for="transactionAccount">Account</label>
        <select id="transactionAccount">${accounts}</select>
        <label for="transactionDate">Date</label>
        <input id="transactionDate" type="date" value="${escapeHTML(transaction?.transaction_date || localDate())}">
        <div class="modal-actions"><button class="btn" onclick="saveTransaction(${transaction ? Number(transaction.id) : "null"})">${transaction ? "Save changes" : "Save transaction"}</button></div>
    `;
}

async function showAddTransactionModal() {
    try {
        openModal("💳 Add Transaction", transactionFormMarkup(await getAccountOptions()));
    } catch (error) {
        showError(error);
    }
}

async function showEditTransactionModal(transaction) {
    try {
        openModal("✏️ Edit Transaction", transactionFormMarkup(
            await getAccountOptions(transaction.account_id), transaction
        ));
    } catch (error) {
        showError(error);
    }
}

async function saveTransaction(transactionId = null) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Authentication required.");
        const description = document.getElementById("transactionDescription").value.trim();
        const amountInput = document.getElementById("transactionAmount").value;
        const amountValue = Number(amountInput);
        if (!description) throw new Error("Enter a transaction description.");
        if (!Number.isFinite(amountValue) || amountValue <= 0) throw new Error("Enter an amount greater than zero.");
        const amount = document.getElementById("transactionType").value === "Income"
            ? amountValue : -amountValue;
        const transactionDate = document.getElementById("transactionDate").value;
        if (!transactionDate) throw new Error("Choose a transaction date.");

        const { error } = await getSB().rpc("save_money_transaction", {
            p_transaction_id: transactionId,
            p_account_id: Number(document.getElementById("transactionAccount").value),
            p_description: description,
            p_amount: amount,
            p_category: document.getElementById("transactionCategory").value,
            p_transaction_date: transactionDate
        });
        if (error) throw error;
        closeModal();
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

async function showTransferModal() {
    try {
        const accounts = await getAccountOptions();
        openModal("🔄 Transfer Funds", `
            <label for="fromAccount">From account</label>
            <select id="fromAccount">${accounts}</select>
            <label for="toAccount">To account</label>
            <select id="toAccount">${accounts}</select>
            <label for="transferAmount">Amount</label>
            <input id="transferAmount" type="number" min="0.01" step="0.01" placeholder="0.00">
            <p class="form-hint">Transfers update both balances together.</p>
            <div class="modal-actions"><button class="btn" onclick="saveTransfer()">Transfer</button></div>
        `);
    } catch (error) {
        showError(error);
    }
}

async function saveTransfer() {
    try {
        const fromAccount = Number(document.getElementById("fromAccount").value);
        const toAccount = Number(document.getElementById("toAccount").value);
        const amount = Number(document.getElementById("transferAmount").value);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
        if (fromAccount === toAccount) throw new Error("Choose two different accounts.");
        const { error } = await getSB().rpc("transfer_money_between_accounts", {
            p_from_account_id: fromAccount,
            p_to_account_id: toAccount,
            p_amount: amount
        });
        if (error) throw error;
        closeModal();
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

function showAddBudgetModal() {
    openModal("📋 Add Budget Category", `
        <label for="budgetName">Category name</label>
        <input id="budgetName" maxlength="80" placeholder="e.g. Groceries">
        <label for="budgetAmount">Monthly budget</label>
        <input id="budgetAmount" type="number" min="0" step="0.01" placeholder="0.00">
        <div class="modal-actions"><button class="btn" onclick="saveBudgetCategory()">Save category</button></div>
    `);
}

async function saveBudgetCategory() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Authentication required.");
        const categoryName = document.getElementById("budgetName").value.trim();
        const amountInput = document.getElementById("budgetAmount").value;
        const monthlyBudget = Number(amountInput);
        if (!categoryName) throw new Error("Enter a category name.");
        if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) throw new Error("Enter a valid monthly budget.");
        const { error } = await getSB().from("budget_categories").insert({
            user_id: user.id,
            category_name: categoryName,
            monthly_budget: monthlyBudget
        });
        if (error) throw error;
        closeModal();
        await refreshDashboard();
    } catch (error) {
        showError(error);
    }
}

async function loadBudgetCategories() {
    const revision = authRevision;
    const user = await getCurrentUser();
    if (!user) return;
    const { data, error } = await getSB().from("budget_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("category_name");
    if (error) throw error;
    if (revision !== authRevision) return;

    const container = document.getElementById("budgetList");
    container.replaceChildren();
    if (!data?.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No budget categories. Add one to see how spending compares with your plan.";
        container.appendChild(empty);
        return;
    }
    data.forEach(category => {
        const item = document.createElement("article");
        item.className = "list-item budget-item";
        const name = document.createElement("strong");
        name.textContent = category.category_name;
        const amount = document.createElement("span");
        amount.textContent = currency(category.monthly_budget);
        item.append(name, amount);
        container.appendChild(item);
    });
}

async function refreshDashboard() {
    const revision = authRevision;
    const results = await Promise.allSettled([
        loadDashboard(), loadAccounts(), loadTransactions(), loadBudgetCategories()
    ]);
    if (revision !== authRevision) return;
    const failure = results.find(result => result.status === "rejected");
    if (failure) {
        showError(failure.reason);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("signInForm").addEventListener("submit", signIn);
    document.getElementById("signOutButton").addEventListener("click", signOut);
    document.getElementById("transactionSearch").addEventListener("input", renderTransactions);
    document.getElementById("transactionCategoryFilter").addEventListener("change", renderTransactions);
    document.getElementById("transactionPeriodFilter").addEventListener("change", renderTransactions);
    document.getElementById("modalOverlay").addEventListener("click", event => {
        if (event.target.id === "modalOverlay") closeModal();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeModal();
    });
    try {
        getSB().auth.onAuthStateChange(event => {
            if (event === "SIGNED_OUT") {
                ++authRevision;
                showSignedOut("Your session ended. Sign in to continue.");
                document.getElementById("signInButton").disabled = false;
            } else if (event === "SIGNED_IN") {
                ++authRevision;
                showSignedOut("Checking your session…");
                setTimeout(() => { checkSession(); }, 0);
            }
        });
    } catch (error) {
        console.error("Could not subscribe to session changes", error);
    }
    await checkSession();
});
