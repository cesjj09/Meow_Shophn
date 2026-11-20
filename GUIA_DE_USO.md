# Guía de uso – Meow Shop HN

## 1. Para el cliente
1. Entra a la tienda y elige una categoría o busca por nombre o código.
2. Toca un producto para ver el detalle y elige talla y color.
3. Toca **Comprar por WhatsApp**. Se abre el chat con un mensaje ya escrito que incluye producto, código (SKU), talla, color, precio y un enlace directo.
4. El vendedor recibe el mensaje y sabe exactamente qué producto es. Si abre el enlace, ve el mismo producto en la tienda.

## 2. Para el administrador
Entra a `admin.html` (por ejemplo `https://cesjj09.github.io/Meow_Shophn/admin.html`) con el correo y la contraseña creados en Supabase.

- **Nuevo producto:** botón `+ Nuevo producto`. Llena nombre, precio, categoría, descripción, tallas y colores (separados por coma), y sube una foto (JPG/PNG/WebP, máx. 2 MB) o pega una URL. Si dejas el código vacío, se genera solo (MS-0001, MS-0002…).
- **Editar:** botón `Editar` en la fila del producto.
- **Ocultar sin borrar:** desmarca “Visible en la tienda” (útil para productos agotados).
- **Eliminar:** botón `Eliminar` (pide confirmación; no se puede deshacer).
- **Categorías:** pestaña `Categorías` para agregar o eliminar.
- **Cambiar el WhatsApp de ventas:** pestaña `Ajustes`, escribe el nuevo número (código de país + número) y guarda. Se aplica de inmediato en la tienda, sin tocar código.
- Al terminar, usa `Cerrar sesión`, sobre todo en equipos compartidos.

## 3. Configuración inicial (una sola vez)
1. En Supabase > **SQL Editor**, ejecuta completo `supabase/schema.sql`.
2. En Supabase > **Authentication > Users**, crea tu usuario administrador (correo + contraseña fuerte).
3. Ejecuta en el SQL Editor (con tu correo):
   `insert into public.admins (user_id) select id from auth.users where email = 'TU_CORREO';`
4. En **Authentication > Providers > Email**, desactiva “Allow new users to sign up”.
5. `js/config.js` ya trae la clave pública (publishable) y un número de respaldo; el número real se administra desde el panel (pestaña Ajustes).
6. Publica en GitHub Pages: Settings > Pages > Branch `main` / carpeta `/ (root)`.

## 4. Seguridad
- Solo se usa la clave **anon** (pública). La clave `service_role` nunca va en el repo.
- Las reglas RLS garantizan que cualquiera puede leer el catálogo, pero solo los usuarios de la tabla `admins` pueden modificarlo.
- Los datos de prueba son genéricos; bórralos desde el panel cuando cargues los reales.
