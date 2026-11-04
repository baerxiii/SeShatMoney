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

            balance:balance

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
Placeholders
=========================================
*/

function showAddTransactionModal(){

    alert(
        "Transactions coming next."
    );
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

        console.log(
            "Dashboard Loaded"
        );

    }
);
