insert into users (username) values ('demo.admin') on conflict (username) do nothing;
insert into user_roles (user_id, role_id)
select u.id, r.id from users u join roles r on u.username = 'demo.admin' and r.code = 'ADMIN'
on conflict do nothing;
