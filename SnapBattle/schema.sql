-- SnapBattle: cole tudo no SQL Editor do Supabase e clique em RUN.
-- Código de convite: troque 'FAMILIA2026' abaixo (ou depois: update settings set value='NOVO' where key='invite_code';)
create table settings(key text primary key, value text); alter table settings enable row level security;
insert into settings values('invite_code','FAMILIA2026');

create function sp_today() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create table profiles(id uuid primary key references auth.users on delete cascade, username text not null, avatar_url text, invite_code_used text, created_at timestamptz default now());
create table photos(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, image_url text not null, caption text check(char_length(caption)<=100), challenge_date date not null, created_at timestamptz default now(), unique(user_id,challenge_date));
create table votes(id uuid primary key default gen_random_uuid(), photo_id uuid not null references photos(id) on delete cascade, voter_id uuid not null references profiles(id) on delete cascade, score int not null check(score between 1 and 5), created_at timestamptz default now(), unique(photo_id,voter_id));
create table spectators(user_id uuid references profiles(id) on delete cascade, day date, primary key(user_id,day));

-- Cadastro fechado: valida o convite no servidor e cria o perfil
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.raw_user_meta_data->>'invite','') <> (select value from settings where key='invite_code') then raise exception 'Código de convite inválido'; end if;
  insert into profiles(id,username,invite_code_used) values(new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(new.email,'@',1)), new.raw_user_meta_data->>'invite');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Quem postou (ou é espectador) no dia pode ver as fotos do dia
create function has_access(d date) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from photos where user_id=auth.uid() and challenge_date=d) or exists(select 1 from spectators where user_id=auth.uid() and day=d) $$;

-- Regras de voto: não na própria foto, só no dia corrente, só quem postou
create function check_vote() returns trigger language plpgsql security definer set search_path=public as $$
declare p photos%rowtype;
begin
  select * into p from photos where id=new.photo_id;
  if p.user_id=new.voter_id then raise exception 'Você não pode votar na própria foto'; end if;
  if p.challenge_date<>sp_today() then raise exception 'Rodada encerrada'; end if;
  if not exists(select 1 from photos where user_id=new.voter_id and challenge_date=p.challenge_date) then raise exception 'Poste sua foto para votar'; end if;
  return new;
end $$;
create trigger t_check_vote before insert or update on votes for each row execute function check_vote();

-- Resultados de um dia ENCERRADO e ranking geral
create function day_results(d date) returns table(photo_id uuid,user_id uuid,username text,image_url text,caption text,avg_score numeric,votes_count bigint,rnk bigint)
language sql security definer stable set search_path=public as $$
  select * from (select p.id,p.user_id,pr.username,p.image_url,p.caption,round(avg(v.score),2),count(v.id),rank() over(order by avg(v.score) desc nulls last)
  from photos p join profiles pr on pr.id=p.user_id left join votes v on v.photo_id=p.id
  where p.challenge_date=d and d<sp_today() group by p.id,pr.username) x order by 8 $$;

create function ranking() returns table(user_id uuid,username text,total_points bigint,wins bigint)
language sql security definer stable set search_path=public as $$
  with d as (select p.id,p.user_id,p.challenge_date,sum(v.score) pts,avg(v.score) av from photos p left join votes v on v.photo_id=p.id where p.challenge_date<sp_today() group by p.id),
  w as (select *,rank() over(partition by challenge_date order by av desc nulls last) r from d)
  select pr.id,pr.username,coalesce(sum(w.pts),0)::bigint,(count(*) filter(where w.r=1 and w.av is not null))::bigint
  from profiles pr left join w on w.user_id=pr.id group by pr.id,pr.username order by 3 desc,4 desc $$;
revoke execute on function day_results(date),ranking() from public,anon;
grant execute on function day_results(date),ranking() to authenticated;

-- RLS
alter table profiles enable row level security; alter table photos enable row level security; alter table votes enable row level security; alter table spectators enable row level security;
create policy pr_sel on profiles for select to authenticated using(true);
create policy pr_upd on profiles for update to authenticated using(id=auth.uid());
create policy ph_sel on photos for select to authenticated using(challenge_date<sp_today() or user_id=auth.uid() or has_access(challenge_date));
create policy ph_ins on photos for insert to authenticated with check(user_id=auth.uid() and challenge_date=sp_today());
create policy ph_del on photos for delete to authenticated using(user_id=auth.uid() and challenge_date=sp_today());
create policy vt_sel on votes for select to authenticated using(voter_id=auth.uid());
create policy vt_ins on votes for insert to authenticated with check(voter_id=auth.uid());
create policy vt_upd on votes for update to authenticated using(voter_id=auth.uid()) with check(voter_id=auth.uid());
create policy sp_sel on spectators for select to authenticated using(user_id=auth.uid());
create policy sp_ins on spectators for insert to authenticated with check(user_id=auth.uid() and day=sp_today());

-- Storage
insert into storage.buckets(id,name,public) values('daily-photos','daily-photos',true) on conflict do nothing;
create policy st_sel on storage.objects for select using(bucket_id='daily-photos');
create policy st_ins on storage.objects for insert to authenticated with check(bucket_id='daily-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy st_upd on storage.objects for update to authenticated using(bucket_id='daily-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy st_del on storage.objects for delete to authenticated using(bucket_id='daily-photos' and (storage.foldername(name))[1]=auth.uid()::text);
