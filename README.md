# SeShatMoney
Financial Tracking Application

The dashboard automatically reuses the SeShat Hub session when both apps are
opened on the same origin in the same browser and browser profile. Otherwise,
sign in directly using the same Hub email and password; credentials are not passed
in the URL. Signing out of Money also signs out the shared Hub session in that
browser. Private browsing or a different device requires a separate sign-in.

Monthly income and spending
include only transactions dated this month. Budget remaining is the total monthly
budget less spending in budgeted categories. Transactions can be searched and
filtered by category or month.

## Database setup

Run `database/money-transaction-functions.sql` in the Supabase SQL Editor. It
adds authenticated, row-level-security-respecting database functions that apply
transfers and transaction create/edit/delete balance changes atomically. Until
the functions are installed, those actions return a database error rather than
partially updating balances.
