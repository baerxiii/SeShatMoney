# SeShatMoney
Financial Tracking Application

The dashboard automatically reuses the SeShat Hub session when both apps are
opened on the same origin in the same browser and browser profile. Otherwise,
sign in directly using the same Hub email and password; credentials are not passed
in the URL. Signing out of Money also signs out the shared Hub session in that
browser. Private browsing or a different device requires a separate sign-in.

Monthly income and spending include transactions dated this month through today.
The Dashboard tab summarizes the month; use the Accounts, Transactions,
Budgets, and Transfers tabs to manage each area.
Each budget category shows its monthly limit, expenses so far, and remaining
amount (or how far it is over budget). The limit itself is not changed: adding,
editing, or deleting an expense recalculates the balance, and a new month starts
with the same limit. Category names are matched case-insensitively with surrounding
whitespace removed. Existing duplicate budget names are combined. Income does not
deduct from a budget, and future-dated expenses are included when their date
arrives. Budget categories are available in the transaction form. Transactions
can also be searched and filtered by category or month.

Use Edit on an account to change its name, type, or current balance. Enter a
negative balance for money owed, including credit cards. A balance adjustment
does not create income or spending. If the balance changed since the edit form
was opened, refresh and reopen it before adjusting.

The Transfers tab shows transfer history; the Transactions tab shows account
activity for transaction creation, edits and deletions, and balance adjustments.
Each entry records the affected accounts' balances before and after the change,
at the time it was made. A transaction edit that moves accounts shows both.
History begins after the database update is installed; earlier balances cannot
be reconstructed reliably. Account names are recorded at the time of each
change. History is private to the signed-in user but is not a tamper-proof audit
log. Direct database changes or older clients do not create history entries.

## Database setup

Run the updated `database/money-transaction-functions.sql` in the Supabase SQL
Editor before deploying this version, including when a previous version was
already installed. It creates the activity table and adds authenticated,
row-level-security-respecting functions that record transfers, balance
adjustments, and transaction create/edit/delete balance changes atomically.
The update does not modify existing balances or backfill history. Until it is
installed, the new history and account-edit features return a database error.
