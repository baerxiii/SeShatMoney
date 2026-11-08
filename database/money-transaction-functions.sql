begin;

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
begin
    if v_user_id is null then
        raise exception 'Sign in is required to transfer funds.';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'Transfer amount must be greater than zero.';
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
begin
    if v_user_id is null then
        raise exception 'Sign in is required to save transactions.';
    end if;
    if p_description is null or length(trim(p_description)) = 0 then
        raise exception 'Transaction description is required.';
    end if;
    if p_amount is null or p_amount = 0 then
        raise exception 'Transaction amount must not be zero.';
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
begin
    if v_user_id is null then
        raise exception 'Sign in is required to delete transactions.';
    end if;

    select account_id, amount
    into v_account_id, v_amount
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
end;
$$;

revoke all on function public.transfer_money_between_accounts(bigint, bigint, numeric) from public, anon, authenticated;
revoke all on function public.save_money_transaction(bigint, bigint, text, numeric, text, date) from public, anon, authenticated;
revoke all on function public.delete_money_transaction(bigint) from public, anon, authenticated;
grant execute on function public.transfer_money_between_accounts(bigint, bigint, numeric) to authenticated;
grant execute on function public.save_money_transaction(bigint, bigint, text, numeric, text, date) to authenticated;
grant execute on function public.delete_money_transaction(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
