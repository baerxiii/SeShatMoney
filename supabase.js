const SUPABASE_URL =
'https://cujvvxyadxvlfvhgzlki.supabase.co';

const SUPABASE_KEY =
'sb_publishable_wogqNQurYqmvOx9FvoFxMQ_XyRMTxZ_';

const sb =
supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

window.moneySB = sb;
