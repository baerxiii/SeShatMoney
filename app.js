/*
=========================================
SeShat Money
=========================================
*/

function getSB(){

    return window.seshat.supabase;
}

/*
=========================================
Authentication
=========================================
*/

async function getCurrentUser(){

    const {
        data:{user},
        error
    } =
    await getSB()
        .auth
        .getUser();

    if(error){

        console.error(
            "User Error:",
            error
        );

        return null;
    }

    return user;
}

async function checkSession(){

    const user =
        await getCurrentUser();

    if(!user){

        document.body.innerHTML = `

        <div style="
            color:white;
            padding:40px;
            text-align:center;">

            <h2>

                Please sign into SeShat Hub first

            </h2>

        </div>

        `;

        return false;
    }

    return true;
}

/*
=========================================
Dashboard
=========================================
*/

async function loadDashboard(){

    const user =
        await getCurrentUser();

    if(!user) return;

    const {
        count
    } =
    await getSB()
        .from("money_accounts")
        .select(
            "*",
            {
                count:"exact",
                head:true
            }
        )
        .eq(
            "user_id",
            user.id
        );

    document.getElementById(
        "accountCount"
    ).innerText =
        count || 0;

    const {
        data:transactions
    } =
    await getSB()
        .from("money_transactions")
        .select("*")
        .eq(
            "user_id",
            user.id
        );

    let income = 0;
    let spending = 0;

    (transactions || []).forEach(t=>{

        const amount =
            Number(
                t.amount || 0
            );

        if(amount > 0){

            income += amount;

        }else{

            spending +=
                Math.abs(
                    amount
                );
        }

    });

    document.getElementById(
        "monthlyIncome"
    ).innerText =
        `$${income.toFixed(2)}`;

    document.getElementById(
        "monthlySpending"
    ).innerText =
        `$${spending.toFixed(2)}`;

    document.getElementById(
        "remainingBudget"
    ).innerText =
        `$${(income-spending).toFixed(2)}`;
}

/*
=========================================
Accounts
=========================================
*/

async function loadAccounts(){

    const user =
        await getCurrentUser();

    if(!user) return;

    const {
        data,
        error
    } =
    await getSB()
        .from("money_accounts")
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .order("name");

    if(error){

        console.error(error);

        return;
    }

    const container =
        document.getElementById(
            "accountsList"
        );

    if(!container) return;

    container.innerHTML = "";

    if(!data.length){

        container.innerHTML = `

        <div class="list-item">

            No accounts yet.

        </div>

        `;

        return;
    }

    data.forEach(account=>{

        container.innerHTML += `

        <div class="list-item">

            <strong>

                ${account.name}

            </strong>

            <br>

            ${account.type}

            •

            $${Number(
                account.balance || 0
            ).toFixed(2)}

            <br><br>

            <button
                class="btn"
                onclick="deleteAccount(${account.id})">

                Delete

            </button>

        </div>

        `;

    });
}

/*
=========================================
Delete Account
=========================================
*/

async function deleteAccount(id){

    if(
        !confirm(
            "Delete account?"
        )
    ){
        return;
    }

    await getSB()
        .from("money_accounts")
        .delete()
        .eq(
            "id",
            id
        );

    loadAccounts();

    loadDashboard();
}

/*
=========================================
Modal System
=========================================
*/

function openModal(
    title,
    content
){

    document.getElementById(
        "modalTitle"
    ).innerHTML =
        title;

    document.getElementById(
        "modalContent"
    ).innerHTML =
        content;

    document.getElementById(
        "modalOverlay"
    ).style.display =
        "flex";
}

function closeModal(){

    document.getElementById(
        "modalOverlay"
    ).style.display =
        "none";
}

/*
=========================================
Add Account Modal
=========================================
*/

function showAddAccountModal(){

    openModal(

        "🏦 Add Account",

        `

        <input
            id="accountName"
            placeholder="Account Name">

        <br><br>

        <select
            id="accountType">

            <option>
    Checking
</option>

<option>
    Savings
</option>

<option>
    Credit Card
</option>

<option>
    Line of Credit
</option>

<option>
    Loan
</option>

<option>
    Mortgage
</option>

<option>
    Investment
</option>

<option>
    Cash
</option>
        </select>

        <br><br>

        <input
            id="accountBalance"
            type="number"
            placeholder="Opening Balance">

        <br><br>

        <button
            class="btn"
            onclick="saveAccount()">

            Save Account

        </button>

        `

    );
}

async function saveAccount(){

    const user =
        await getCurrentUser();

    if(!user){

        alert(
            "Authentication required."
        );

        return;
    }

    const name =
        document.getElementById(
            "accountName"
        ).value
        .trim();

    const type =
        document.getElementById(
            "accountType"
        ).value;

    const balance =
        Number(
            document.getElementById(
                "accountBalance"
            ).value || 0
        );

    let finalBalance = balance;

if(
    type === "Credit Card"
){

    finalBalance =
        -Math.abs(balance);

}

    if(!name){

        alert(
            "Enter account name."
        );

        return;
    }

    const {
        error
    } =
    await getSB()
        .from("money_accounts")
        .insert({

            user_id:user.id,

            name:name,

            type:type,

            balance:finalBalance

        });

    if(error){

        console.error(
            error
        );

        alert(
            error.message
        );

        return;
    }

    closeModal();

    loadAccounts();

    loadDashboard();
}

/*
=========================================
Transactions
=========================================
*/

async function loadTransactions(){

    const user =
        await getCurrentUser();

    if(!user){
        return;
    }

    const {
        data,
        error
    } =
    await getSB()
        .from("money_transactions")
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .order(
            "transaction_date",
            {
                ascending:false
            }
        );

    if(error){

        console.error(error);

        return;
    }

    const container =
        document.getElementById(
            "transactionsList"
        );

    if(!container){
        return;
    }

    container.innerHTML = "";

    if(!data || !data.length){

        container.innerHTML = `
            <div class="list-item">
                No transactions.
            </div>
        `;

        return;
    }

    data.forEach(transaction=>{

        const amount =
            Number(
                transaction.amount || 0
            );

        const color =
            amount >= 0
                ? "#22c55e"
                : "#ef4444";

        container.innerHTML += `

        <div class="list-item">

            <strong>
                ${transaction.description}
            </strong>

            <br>

            ${transaction.category || "Uncategorized"}

            <br>

            <span style="color:${color};">

                $${amount.toFixed(2)}

            </span>

            <br>

            ${transaction.transaction_date || ""}

            <br><br>

            <button
                class="btn"
                onclick="deleteTransaction(${transaction.id})">

                Delete

            </button>

        </div>

        `;
    });

}

async function deleteTransaction(id){

    if(
        !confirm(
            "Delete transaction?"
        )
    ){
        return;
    }

    const {
        error
    } =
    await getSB()
        .from("money_transactions")
        .delete()
        .eq(
            "id",
            id
        );

    if(error){

        alert(
            error.message
        );

        return;
    }

    loadTransactions();

    loadDashboard();

}

async function showAddTransactionModal(){

    const user =
        await getCurrentUser();

    const {
        data:accounts
    } =
    await getSB()
        .from("money_accounts")
        .select("*")
        .eq(
            "user_id",
            user.id
        );

    let options = "";

    accounts.forEach(account=>{

        options += `
            <option value="${account.id}">
                ${account.name}
            </option>
        `;

    });

    openModal(

        "💳 Add Transaction",

        `

        <input
            id="transactionDescription"
            placeholder="Description">

        <br><br>

        <input
            id="transactionAmount"
            type="number"
            step="0.01"
            placeholder="Amount">

        <br><br>

        <select
            id="transactionCategory">

            <option>Income</option>
            <option>Groceries</option>
            <option>Fuel</option>
            <option>Dining</option>
            <option>Utilities</option>
            <option>Insurance</option>
            <option>Entertainment</option>

        </select>

        <br><br>

        <select
            id="transactionAccount">

            ${options}

        </select>

        <br><br>

        <input
            id="transactionDate"
            type="date">

        <br><br>

        <button
            class="btn"
            onclick="saveTransaction()">

            Save Transaction

        </button>

        `
    );
}

async function saveTransaction(){

    const user =
        await getCurrentUser();

    const description =
        document
            .getElementById(
                "transactionDescription"
            )
            .value
            .trim();

    const amount =
        Number(
            document
                .getElementById(
                    "transactionAmount"
                )
                .value
        );

    const category =
        document
            .getElementById(
                "transactionCategory"
            )
            .value;

    const accountId =
        document
            .getElementById(
                "transactionAccount"
            )
            .value;

    const transactionDate =
        document
            .getElementById(
                "transactionDate"
            )
            .value;

    if(!description){

        alert(
            "Description required."
        );

        return;
    }

    const {
        error
    } =
    await getSB()
        .from("money_transactions")
        .insert({

            user_id:user.id,

            account_id:accountId,

            description,

            amount,

            category,

            transaction_date:
                transactionDate

        });

    const {
    data:account,
    error:accountError
} =
await getSB()
    .from("money_accounts")
    .select("*")
    .eq(
        "id",
        accountId
    )
    .single();

if(
    !accountError &&
    account
){

    const newBalance =
        Number(
            account.balance || 0
        )
        +
        Number(amount);

    await getSB()
        .from("money_accounts")
        .update({

            balance:newBalance

        })
        .eq(
            "id",
            accountId
        );
}

    if(error){

        alert(
            error.message
        );

        return;
    }

    closeModal();

    loadTransactions();

    loadAccounts();

    loadDashboard();
}

/*
=========================================
Placeholders
=========================================
*/

async function showAddTransactionModal(){

    const user =
        await getCurrentUser();

    const {
        data:accounts
    } =
    await getSB()
        .from("money_accounts")
        .select("*")
        .eq(
            "user_id",
            user.id
        );

    let options = "";

    accounts.forEach(a=>{

        options += `

        <option value="${a.id}">

            ${a.name}

        </option>

        `;

    });

    openModal(

        "💳 Add Transaction",

        `

        <input
            id="transactionDescription"
            placeholder="Description">

        <br><br>

        <input
            id="transactionAmount"
            type="number"
            step="0.01"
            placeholder="Amount">

        <br><br>

        <select
            id="transactionCategory">

            <option>Income</option>
            <option>Groceries</option>
            <option>Fuel</option>
            <option>Dining</option>
            <option>Utilities</option>
            <option>Insurance</option>
            <option>Entertainment</option>

        </select>

        <br><br>

        <select
            id="transactionAccount">

            ${options}

        </select>

        <br><br>

        <input
            id="transactionDate"
            type="date">

        <br><br>

        <button
            class="btn"
            onclick="saveTransaction()">

            Save Transaction

        </button>

        `
    );
}

async function saveTransaction(){

    const user =
        await getCurrentUser();

    const description =
        document
        .getElementById(
            "transactionDescription"
        )
        .value
        .trim();

    const amount =
        Number(
            document
            .getElementById(
                "transactionAmount"
            )
            .value
        );

    const category =
        document
        .getElementById(
            "transactionCategory"
        )
        .value;

    const accountId =
        document
        .getElementById(
            "transactionAccount"
        )
        .value;

    const transactionDate =
        document
        .getElementById(
            "transactionDate"
        )
        .value;

    if(!description){

        alert(
            "Description required."
        );

        return;
    }

    await getSB()
        .from("money_transactions")
        .insert({

            user_id:user.id,

            account_id:accountId,

            description,

            amount,

            category,

            transaction_date:
                transactionDate

        });

    closeModal();

    loadDashboard();

    loadTransactions();
}

function showAddBudgetModal(){

    alert(
        "Budgets coming next."
    );
}

function showAddBillModal(){

    alert(
        "Bills coming next."
    );
}

/*
=========================================
Startup
=========================================
*/

document.addEventListener(
    "DOMContentLoaded",
    async ()=>{

        const valid =
            await checkSession();

        if(!valid)
            return;

        await loadDashboard();

        await loadAccounts();

        await loadTransactions();

        console.log(
            "Dashboard Loaded"
        );

    }
);
