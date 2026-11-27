-- =====================================================================
-- Meow Shop HN - Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- Se puede ejecutar varias veces sin borrar datos (es idempotente).
-- No contiene claves ni datos personales ni datos de prueba.
-- =====================================================================

-- 1. Tablas -------------------------------------------------------------
create table if not exists public.categorias (
  id         bigint generated always as identity primary key,
  nombre     text not null unique check (char_length(nombre) between 2 and 60),
  created_at timestamptz not null default now()
);

-- Números de WhatsApp con nombre. Cada producto puede usar uno distinto.
-- El primero (menor id) es el principal: se usa en "Contáctanos" y como respaldo.
create table if not exists public.numeros_whatsapp (
  id         bigint generated always as identity primary key,
  nombre     text not null check (char_length(nombre) between 2 and 60),
  numero     text not null unique check (numero ~ '^[0-9]{10,15}$'),
  created_at timestamptz not null default now()
);

create sequence if not exists public.sku_seq start 1;

create table if not exists public.productos (
  id              uuid primary key default gen_random_uuid(),
  -- Internos (el comprador NO los ve; ver permisos más abajo): sku, vendedor, disponible
  sku             text not null unique
                  default ('MS-' || lpad(nextval('public.sku_seq')::text, 4, '0')),
  vendedor        text check (vendedor in ('Abigail','Luis','Montserrath','Juan')),
  disponible      boolean not null default true,        -- true = No vendido, false = Vendido
  numero_id       bigint references public.numeros_whatsapp(id) on delete set null,
  -- Visibles para el comprador
  nombre          text not null check (char_length(nombre) between 2 and 120),
  descripcion     text not null default '' check (char_length(descripcion) <= 1500),
  precio          numeric(10,2) not null check (precio >= 0),
  sexo            text not null default 'Unisex' check (char_length(sexo) <= 20),
  estado_producto text not null default 'Nuevo' check (estado_producto in ('Nuevo','Semi-nuevo','Buen estado')),
  unidades        integer not null default 1 check (unidades >= 1),
  tallas          text[] not null default '{}',
  colores         text[] not null default '{}',
  imagenes        text[] not null default '{}',          -- URLs de las fotos; la primera es la portada
  activo          boolean not null default true,         -- visible en la tienda
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Un producto vendido siempre queda oculto
  constraint productos_vendido_oculto check (disponible or not activo)
);
create index if not exists productos_activo_idx on public.productos (activo);
create index if not exists productos_numero_idx on public.productos (numero_id);

-- Un producto puede tener varias categorías
create table if not exists public.producto_categorias (
  producto_id  uuid   not null references public.productos(id)  on delete cascade,
  categoria_id bigint not null references public.categorias(id) on delete cascade,
  primary key (producto_id, categoria_id)
);
create index if not exists producto_categorias_cat_idx on public.producto_categorias (categoria_id);

-- Administradores: solo los usuarios listados aquí pueden modificar datos
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 2. Funciones y triggers -------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists productos_updated_at on public.productos;
create trigger productos_updated_at before update on public.productos
  for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3. Row Level Security (quién puede ver y escribir qué filas) -------------
alter table public.categorias          enable row level security;
alter table public.numeros_whatsapp    enable row level security;
alter table public.productos           enable row level security;
alter table public.producto_categorias enable row level security;
alter table public.admins              enable row level security;

drop policy if exists "categorias_lectura_publica" on public.categorias;
create policy "categorias_lectura_publica" on public.categorias
  for select using (true);
drop policy if exists "categorias_admin_escritura" on public.categorias;
create policy "categorias_admin_escritura" on public.categorias
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "numeros_lectura_publica" on public.numeros_whatsapp;
create policy "numeros_lectura_publica" on public.numeros_whatsapp
  for select using (true);
drop policy if exists "numeros_admin_escritura" on public.numeros_whatsapp;
create policy "numeros_admin_escritura" on public.numeros_whatsapp
  for all using (public.is_admin()) with check (public.is_admin());

-- Los visitantes solo ven productos activos (un producto vendido nunca está activo)
drop policy if exists "productos_lectura_publica" on public.productos;
create policy "productos_lectura_publica" on public.productos
  for select using (activo = true or public.is_admin());
drop policy if exists "productos_admin_escritura" on public.productos;
create policy "productos_admin_escritura" on public.productos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pc_lectura_publica" on public.producto_categorias;
create policy "pc_lectura_publica" on public.producto_categorias
  for select using (
    exists (select 1 from public.productos p where p.id = producto_id and (p.activo = true or public.is_admin()))
  );
drop policy if exists "pc_admin_escritura" on public.producto_categorias;
create policy "pc_admin_escritura" on public.producto_categorias
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins_ver_propio" on public.admins;
create policy "admins_ver_propio" on public.admins
  for select using (user_id = auth.uid());

-- 4. Permisos de acceso para la API ----------------------------------------
-- Se parte de cero y se concede solo lo necesario.
revoke all on public.categorias, public.numeros_whatsapp, public.productos,
              public.producto_categorias, public.admins from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Visitantes: solo lectura y solo columnas públicas. NO pueden leer del producto:
-- sku, vendedor ni disponible; ni el nombre de los números. "select *" les falla.
grant select on public.categorias, public.producto_categorias to anon, authenticated;
grant select (id, nombre, descripcion, precio, sexo, tallas, colores, imagenes, activo, created_at,
              estado_producto, unidades, numero_id)
  on public.productos to anon;
grant select (id, numero) on public.numeros_whatsapp to anon;

-- Administrador (usuario autenticado y listado en "admins"): lectura completa y escritura
grant select on public.productos, public.numeros_whatsapp, public.admins to authenticated;
grant insert, update, delete on public.categorias, public.numeros_whatsapp, public.productos to authenticated;
grant insert, delete on public.producto_categorias to authenticated;
grant usage, select on sequence public.sku_seq to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- 5. Storage para las fotos -----------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "imagenes_lectura_publica" on storage.objects;
create policy "imagenes_lectura_publica" on storage.objects
  for select using (bucket_id = 'productos');

drop policy if exists "imagenes_admin_insertar" on storage.objects;
create policy "imagenes_admin_insertar" on storage.objects
  for insert with check (bucket_id = 'productos' and public.is_admin());

drop policy if exists "imagenes_admin_actualizar" on storage.objects;
create policy "imagenes_admin_actualizar" on storage.objects
  for update using (bucket_id = 'productos' and public.is_admin());

drop policy if exists "imagenes_admin_borrar" on storage.objects;
create policy "imagenes_admin_borrar" on storage.objects
  for delete using (bucket_id = 'productos' and public.is_admin());

-- 6. Número inicial (se administra desde el panel > Ajustes) ----------------
insert into public.numeros_whatsapp (nombre, numero)
select 'Principal', '50431997265'
where not exists (select 1 from public.numeros_whatsapp);

-- 7. Dar permisos de administrador -----------------------------------------
-- PASO MANUAL: primero crea el usuario en Supabase > Authentication > Users
-- (Add user > Create new user, con tu correo y una contraseña fuerte).
-- Luego ejecuta esto reemplazando el correo:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'TU_CORREO@ejemplo.com';
