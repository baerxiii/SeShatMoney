/*
=========================================
SeShat Money
app.js
=========================================
*/

async function getCurrentUser(){

    const {
        data:{user},
        error
    } =
    await window.moneySB
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

async function loadDashboard(){

    try{

        const user =
            await getCurrentUser();

        if(!user){

            console.log(
                "No authenticated user found."
            );

            return;
        }

        console.log(
            "Money User:",
            user.email
        );

        /*
        =========================
        Accounts
        =========================
        */

        const accountResult =
            await window.moneySB
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
        =========================
        Transactions
        =========================
        */

        const {
            data:transactions,
            error:transactionError
        } =
        await window.moneySB
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

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadDashboard();

    }
);

/*
===================================
Modal System
===================================
*/

function openModal(
    title,
    content
){

    document.getElementById(
        "modalTitle"
    ).innerHTML = title;

    document.getElementById(
        "modalContent"
    ).innerHTML = content;

    document.getElementById(
        "modalOverlay"
    ).style.display = "flex";
}

function closeModal(){

    document.getElementById(
        "modalOverlay"
    ).style.display = "none";
}

/*
===================================
Add Account
===================================
*/

function showAddAccountModal(){

    openModal(

        "🏦 Add Account",

        `
        <input
            id="accountName"
            placeholder="Account Name">

        <br><br>

        <input
            id="accountBalance"
            type="number"
            placeholder="Opening Balance">

        <br><br>

        <button
            onclick="saveAccount()">

            Save Account

        </button>
        `
    );
}

function saveAccount(){

    alert(
        "Account Save Working!"
    );

    closeModal();
}
