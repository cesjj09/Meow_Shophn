# Guía de uso – Meow Shop HN

## 1. Para el cliente
1. Entra a la tienda. El menú (Inicio, Catálogo, Quiénes somos, Contáctanos) se queda fijo arriba; en el celular se abre con el botón de tres rayas.
2. En **Catálogo** puede buscar por nombre y por rango de precio (`Aplicar` / `Restablecer`) y filtrar con la lista horizontal de categorías y sexo. Tocar una categoría la activa; tocarla de nuevo la desactiva.
3. Al tocar una prenda se abre su detalle: fotos (con scroll), nombre, descripción, categorías, sexo y talla/color.
4. **Comprar por WhatsApp** abre el chat con un mensaje ya escrito: producto, talla, color, precio, enlace directo y foto. El vendedor sabe exactamente qué producto es.

## 2. Para el administrador
Entra a `admin.html` (`https://cesjj09.github.io/Meow_Shophn/admin.html`) con tu correo y contraseña.

- **Nuevo producto:** `+ Nuevo producto`. Llena nombre, precio, sexo, categorías (puedes marcar varias), descripción, tallas y colores (separados por coma).
- **Fotos:** elige varias a la vez (hasta 8). Se reducen solas, sin importar el peso. Con `←` y `→` cambias el orden; la primera es la portada. `✕` quita una.
- **Código (SKU):** si lo dejas vacío se genera solo (MS-0001, MS-0002…). **Es secreto:** los clientes no lo ven nunca; solo tú, en el panel y en la tienda si tienes la sesión abierta.
- **Editar / ocultar / eliminar:** botones de cada fila. Para un producto agotado, desmarca "Visible en la tienda". Eliminar es definitivo y también borra sus fotos.
- **Categorías:** pestaña `Categorías`. Créalas antes de usarlas en un producto.
- **WhatsApp de ventas:** pestaña `Ajustes`. El cambio se aplica de inmediato.
- **Identificar un pedido:** cuando un cliente te escriba, toca el enlace "Ver producto" del mensaje. Con tu sesión abierta verás el código del producto.
- Al terminar, `Cerrar sesión`, sobre todo en equipos compartidos.

## 3. Configuración inicial (una sola vez)
1. En Supabase > **SQL Editor**, ejecuta completo `supabase/schema.sql`. Se puede repetir sin perder datos.
2. En **Authentication > Users**, crea tu usuario administrador (correo + contraseña fuerte).
3. Ejecuta (con tu correo): `insert into public.admins (user_id) select id from auth.users where email = 'TU_CORREO';`
4. En **Authentication > Sign In / Providers > Email**, desactiva "Allow new users to sign up".
5. `js/config.js` ya trae la clave pública (publishable); el número real de WhatsApp se administra desde el panel.
6. GitHub Pages: Settings > Pages > Branch `main` / `/ (root)`.

## 4. Seguridad
- Solo se usa la clave pública. La clave `service_role` nunca va en el repo.
- Cualquiera puede leer el catálogo, pero solo los usuarios de la tabla `admins` pueden modificarlo.
- La base de datos no entrega el código (SKU) a los visitantes, aunque consulten la API directamente.
- Las imágenes de ejemplo no se incluyen: las fotos reales las subes tú desde el panel.
