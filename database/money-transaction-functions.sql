begin;

create table if not exists public.money_activity (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    occurred_at timestamptz not null default clock_timestamp(),
    kind text not null,
    description text not null,
    amount numeric not null,
    accounts jsonb not null
);

alter table public.money_activity alter column occurred_at set default clock_timestamp();
alter table public.money_activity enable row level security;
drop policy if exists "read own money activity" on public.money_activity;
create policy "read own money activity" on public.money_activity for select to authenticated
    using (user_id = auth.uid());
drop policy if exists "insert own money activity" on public.money_activity;
create policy "insert own money activity" on public.money_activity for insert to authenticated
    with check (user_id = auth.uid());
revoke all on public.money_activity from public, anon, authenticated;
grant select, insert on public.money_activity to authenticated;
grant usage, select on sequence public.money_activity_id_seq to authenticated;
create index if not exists money_activity_user_time_idx
    on public.money_activity (user_id, occurred_at desc, id desc);

create or replace function public.money_account_snapshot(p_account_ids bigint[])
returns jsonb
language sql
security invoker
set search_path = public, auth
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'balance', coalesce(balance, 0)
    ) order by id), '[]'::jsonb)
    from public.money_accounts
    where user_id = auth.uid() and id = any(p_account_ids);
$$;

create or replace function public.record_money_activity(
    p_kind text, p_description text, p_amount numeric,
    p_account_ids bigint[], p_before jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
    v_accounts jsonb;
begin
    select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name,
        'role', case when p_kind = 'transfer' and a.id = p_account_ids[1] then 'source'
                     when p_kind = 'transfer' and a.id = p_account_ids[2] then 'destination'
                     else null end,
        'before', (before_account->>'balance')::numeric,
        'after', coalesce(a.balance, 0)
    ) order by a.id)
    into v_accounts
    from public.money_accounts a
    join jsonb_array_elements(p_before) before_account
        on (before_account->>'id')::bigint = a.id
    where a.user_id = auth.uid() and a.id = any(p_account_ids);
    if v_accounts is null or jsonb_array_length(v_accounts) <> jsonb_array_length(p_before) then
        raise exception 'Could not record account balance history.';
    end if;
    insert into public.money_activity (user_id, kind, description, amount, accounts)
    values (auth.uid(), p_kind, p_description, p_amount, v_accounts);
end;
$$;

create or replace function public.update_money_account(
    p_account_id bigint, p_name text, p_type text, p_balance numeric,
    p_expected_balance numeric
)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_before jsonb;
    v_balance numeric;
begin
    if v_user_id is null then
        raise exception 'Sign in is required to edit an account.';
    end if;
    if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 80 then
        raise exception 'Enter an account name of up to 80 characters.';
    end if;
    if p_type is null or p_type not in ('Checking', 'Savings', 'Credit Card', 'Line of Credit',
        'Loan', 'Mortgage', 'Investment', 'Cash') then
        raise exception 'Choose a valid account type.';
    end if;
    if p_balance is null or p_balance::text in ('NaN', 'Infinity', '-Infinity')
       or p_balance <> round(p_balance, 2) then
        raise exception 'Enter a valid balance with at most two decimal places.';
    end if;
    select coalesce(balance, 0) into v_balance from public.money_accounts
    where id = p_account_id and user_id = v_user_id for update;
    if not found then
        raise exception 'The account could not be found.';
    end if;
    if p_expected_balance is null or v_balance <> p_expected_balance then
        raise exception 'The account balance changed. Refresh the dashboard and try again.';
    end if;
    v_before := public.money_account_snapshot(array[p_account_id]);
    update public.money_accounts
    set name = trim(p_name), type = p_type, balance = p_balance
    where id = p_account_id and user_id = v_user_id;
    if not found then
        raise exception 'Could not update the account.';
    end if;
    if v_balance <> p_balance then
        perform public.record_money_activity('adjustment', 'Balance adjustment',
            p_balance - v_balance, array[p_account_id], v_before);
    end if;
end;
$$;

create or replace function public.transfer_money_between_accounts(
    p_from_account_id bigint,
    p_to_account_id bigint,
    p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_account_count integer;
    v_updated_count integer;
    v_before jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in is required to transfer funds.';
    end if;
    if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
       or p_amount <= 0 or p_amount <> round(p_amount, 2) then
        raise exception 'Transfer amount must be greater than zero with at most two decimal places.';
    end if;
    if p_from_account_id = p_to_account_id then
        raise exception 'Choose two different accounts.';
    end if;

    perform id
    from public.money_accounts
    where user_id = v_user_id
      and id in (p_from_account_id, p_to_account_id)
    order by id
    for update;
    get diagnostics v_account_count = row_count;

    if v_account_count <> 2 then
        raise exception 'One or both accounts could not be found.';
    end if;

    v_before := public.money_account_snapshot(array[p_from_account_id, p_to_account_id]);
    update public.money_accounts
    set balance = coalesce(balance, 0) - p_amount
    where id = p_from_account_id and user_id = v_user_id;
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
        raise exception 'Could not update the source account.';
    end if;

    update public.money_accounts
    set balance = coalesce(balance, 0) + p_amount
    where id = p_to_account_id and user_id = v_user_id;
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
        raise exception 'Could not update the destination account.';
    end if;
    perform public.record_money_activity('transfer', 'Transfer', p_amount,
        array[p_from_account_id, p_to_account_id], v_before);
end;
$$;

create or replace function public.save_money_transaction(
    p_transaction_id bigint,
    p_account_id bigint,
    p_description text,
    p_amount numeric,
    p_category text,
    p_transaction_date date
)
returns bigint
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_old_account_id bigint;
    v_old_amount numeric;
    v_account_count integer;
    v_updated_count integer;
    v_saved_id bigint;
    v_before jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in is required to save transactions.';
    end if;
    if p_description is null or length(trim(p_description)) = 0 then
        raise exception 'Transaction description is required.';
    end if;
    if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
       or p_amount = 0 or p_amount <> round(p_amount, 2) then
        raise exception 'Transaction amount must not be zero and must have at most two decimal places.';
    end if;
    if p_transaction_date is null then
        raise exception 'Transaction date is required.';
    end if;

    if p_transaction_id is not null then
        select account_id, amount
        into v_old_account_id, v_old_amount
        from public.money_transactions
        where id = p_transaction_id and user_id = v_user_id
        for update;

        if not found then
            raise exception 'Transaction could not be found.';
        end if;
    end if;

    perform id
    from public.money_accounts
    where user_id = v_user_id
      and id in (p_account_id, v_old_account_id)
    order by id
    for update;
    get diagnostics v_account_count = row_count;

    if v_account_count <> (case when v_old_account_id is null then 1
                                when v_old_account_id = p_account_id then 1
                                else 2 end) then
        raise exception 'The selected account could not be found.';
    end if;
    v_before := public.money_account_snapshot(array[p_account_id, v_old_account_id]);

    if p_transaction_id is null then
        insert into public.money_transactions (
            user_id, account_id, description, amount, category, transaction_date
        ) values (
            v_user_id, p_account_id, trim(p_description), p_amount,
            nullif(trim(coalesce(p_category, '')), ''), p_transaction_date
        )
        returning id into v_saved_id;
        if v_saved_id is null then
            raise exception 'Could not create the transaction.';
        end if;

        update public.money_accounts
        set balance = coalesce(balance, 0) + p_amount
        where id = p_account_id and user_id = v_user_id;
        get diagnostics v_updated_count = row_count;
        if v_updated_count <> 1 then
            raise exception 'Could not update the account balance.';
        end if;
    else
        update public.money_transactions
        set account_id = p_account_id,
            description = trim(p_description),
            amount = p_amount,
            category = nullif(trim(coalesce(p_category, '')), ''),
            transaction_date = p_transaction_date
        where id = p_transaction_id and user_id = v_user_id
        returning id into v_saved_id;
        if v_saved_id is null then
            raise exception 'Could not update the transaction.';
        end if;

        if v_old_account_id = p_account_id then
            update public.money_accounts
            set balance = coalesce(balance, 0) + p_amount - coalesce(v_old_amount, 0)
            where id = p_account_id and user_id = v_user_id;
            get diagnostics v_updated_count = row_count;
            if v_updated_count <> 1 then
                raise exception 'Could not update the account balance.';
            end if;
        else
            update public.money_accounts
            set balance = coalesce(balance, 0) - coalesce(v_old_amount, 0)
            where id = v_old_account_id and user_id = v_user_id;
            get diagnostics v_updated_count = row_count;
            if v_updated_count <> 1 then
                raise exception 'Could not update the original account balance.';
            end if;
            update public.money_accounts
            set balance = coalesce(balance, 0) + p_amount
            where id = p_account_id and user_id = v_user_id;
            get diagnostics v_updated_count = row_count;
            if v_updated_count <> 1 then
                raise exception 'Could not update the new account balance.';
            end if;
        end if;
    end if;

    perform public.record_money_activity(
        case when p_transaction_id is null then 'transaction_created' else 'transaction_edited' end,
        trim(p_description), p_amount, array[p_account_id, v_old_account_id], v_before);
    return v_saved_id;
end;
$$;

create or replace function public.delete_money_transaction(p_transaction_id bigint)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_account_id bigint;
    v_amount numeric;
    v_affected_count integer;
    v_description text;
    v_before jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in is required to delete transactions.';
    end if;

    select account_id, amount, description
    into v_account_id, v_amount, v_description
    from public.money_transactions
    where id = p_transaction_id and user_id = v_user_id
    for update;

    if not found then
        raise exception 'Transaction could not be found.';
    end if;

    perform id
    from public.money_accounts
    where id = v_account_id and user_id = v_user_id
    for update;
    if not found then
        raise exception 'The transaction account could not be found.';
    end if;
    v_before := public.money_account_snapshot(array[v_account_id]);

    delete from public.money_transactions
    where id = p_transaction_id and user_id = v_user_id;
    get diagnostics v_affected_count = row_count;
    if v_affected_count <> 1 then
        raise exception 'Could not delete the transaction.';
    end if;

    update public.money_accounts
    set balance = coalesce(balance, 0) - coalesce(v_amount, 0)
    where id = v_account_id and user_id = v_user_id;
    get diagnostics v_affected_count = row_count;
    if v_affected_count <> 1 then
        raise exception 'Could not reverse the account balance change.';
    end if;
    perform public.record_money_activity('transaction_deleted', v_description,
        -coalesce(v_amount, 0), array[v_account_id], v_before);
end;
$$;

revoke all on function public.money_account_snapshot(bigint[]) from public, anon, authenticated;
revoke all on function public.record_money_activity(text, text, numeric, bigint[], jsonb) from public, anon, authenticated;
revoke all on function public.update_money_account(bigint, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.money_account_snapshot(bigint[]) to authenticated;
grant execute on function public.record_money_activity(text, text, numeric, bigint[], jsonb) to authenticated;
grant execute on function public.update_money_account(bigint, text, text, numeric, numeric) to authenticated;
revoke all on function public.transfer_money_between_accounts(bigint, bigint, numeric) from public, anon, authenticated;
revoke all on function public.save_money_transaction(bigint, bigint, text, numeric, text, date) from public, anon, authenticated;
revoke all on function public.delete_money_transaction(bigint) from public, anon, authenticated;
grant execute on function public.transfer_money_between_accounts(bigint, bigint, numeric) to authenticated;
grant execute on function public.save_money_transaction(bigint, bigint, text, numeric, text, date) to authenticated;
grant execute on function public.delete_money_transaction(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
