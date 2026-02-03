-- Backfill public.users from auth.users (id + email)
insert into public.users (id, email)
select id, email
from auth.users
on conflict (id) do nothing;

-- Create trigger to auto-insert into public.users on new auth user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
