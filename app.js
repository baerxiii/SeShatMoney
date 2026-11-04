/*
=========================================
SeShat Money
app.js
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
            padding:40px;
            color:white;
            font-family:sans-serif;
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

    try{

        const user =
            await getCurrentUser();

        if(!user){

            console.log(
                "No authenticated user."
            );

            return;
        }

        console.log(
            "Money User:",
            user.email
        );

        /*
        Accounts
        */

        const accountResult =
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
            accountResult.count || 0;

        /*
        Transactions
        */

        const {
            data:transactions,
            error:transactionError
        } =
        await getSB()
            .from("money_transactions")
            .select("*")
            .eq(
                "user_id",
                user.id
            );

        if(transactionError){

            console.error(
                transactionError
            );

            return;
        }

        let income = 0;

        let spending = 0;

        transactions.forEach(t=>{

            const amount =
                Number(
                    t.amount || 0
                );

            if(amount > 0){

                income += amount;

            }else{

                spending +=
                    Math.abs(amount);
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

        console.log(
            "Dashboard Loaded"
        );

    }catch(error){

        console.error(
            "Dashboard Error:",
            error
        );
    }
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
Account Modal
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

            <option>Checking</option>

            <option>Savings</option>

            <option>Credit Card</option>

            <option>Cash</option>

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
            "Please sign into SeShat Hub first."
        );

        return;
    }

    const name =
        document.getElementById(
            "accountName"
        ).value.trim();

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
            "Account name required."
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

        alert(
            error.message
        );

        return;
    }

    closeModal();

    loadDashboard();
}

/*
=========================================
Placeholder Functions
=========================================
*/

function showAddTransactionModal(){

    alert(
        "Transaction modal coming next."
    );
}

function showAddBudgetModal(){

    alert(
        "Budget modal coming next."
    );
}

function showAddBillModal(){

    alert(
        "Recurring bill modal coming next."
    );
}

/*
=========================================
App Startup
=========================================
*/

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const validSession =
            await checkSession();

        if(!validSession)
            return;

        loadDashboard();

    }
);
