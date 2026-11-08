# SeShatMoney
Financial Tracking Application

The dashboard uses the signed-in SeShat Hub session. Monthly income and spending
include only transactions dated this month. Budget remaining is the total monthly
budget less spending in budgeted categories. Transactions can be searched and
filtered by category or month.

## Database setup

Run `database/money-transaction-functions.sql` in the Supabase SQL Editor. It
adds authenticated, row-level-security-respecting database functions that apply
transfers and transaction create/edit/delete balance changes atomically. Until
the functions are installed, those actions return a database error rather than
partially updating balances.
