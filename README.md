# SeShatMoney
Financial Tracking Application

The dashboard automatically reuses the SeShat Hub session when both apps are
opened on the same origin in the same browser and browser profile. Otherwise,
sign in directly using the same Hub email and password; credentials are not passed
in the URL. Signing out of Money also signs out the shared Hub session in that
browser. Private browsing or a different device requires a separate sign-in.

Monthly income and spending include transactions dated this month through today.
Each budget category shows its monthly limit, expenses so far, and remaining
amount (or how far it is over budget). The limit itself is not changed: adding,
editing, or deleting an expense recalculates the balance, and a new month starts
with the same limit. Category names are matched case-insensitively with surrounding
whitespace removed. Existing duplicate budget names are combined. Income does not
deduct from a budget, and future-dated expenses are included when their date
arrives. Budget categories are available in the transaction form. Transactions
can also be searched and filtered by category or month.

## Database setup

Run `database/money-transaction-functions.sql` in the Supabase SQL Editor. It
adds authenticated, row-level-security-respecting database functions that apply
transfers and transaction create/edit/delete balance changes atomically. Until
the functions are installed, those actions return a database error rather than
partially updating balances.
