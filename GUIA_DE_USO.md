# Guía de uso – Meow Shop HN

## 1. Para el cliente
1. Entra a la tienda. El menú (Inicio, Catálogo, Quiénes somos, Contáctanos) se queda fijo arriba; en el celular se abre con el botón de tres rayas.
2. En **Catálogo** puede buscar por nombre y por rango de precio (el nombre filtra mientras escribes; el precio se aplica con `Aplicar`; `Restablecer` limpia todo) y filtrar con la lista horizontal de categorías y sexo. Cada categoría muestra cuántos productos tiene. Tocar una categoría la activa; tocarla de nuevo la desactiva.
3. Al tocar una prenda se abre su detalle: fotos (con scroll), nombre, descripción, categorías, sexo, **estado** (Nuevo, Semi-nuevo, Buen estado), **unidades**, talla y color(es) mayoritario(s).
4. **Comprar por WhatsApp** abre el chat con un mensaje ya escrito: producto, talla, color(es), precio, enlace directo y foto. Va al número de WhatsApp asignado a ese producto.

## 2. Para el administrador
Entra a `admin.html` (`https://cesjj09.github.io/Meow_Shophn/admin.html`) con tu correo y contraseña.

### Productos
Botón `+ Nuevo producto` (o `Editar` en la fila). Campos:

| Campo | Qué es | ¿Lo ve el comprador? |
|---|---|---|
| Nombre, Precio, Sexo, Descripción | Datos básicos | Sí |
| Estado del producto | Nuevo, Semi-nuevo o Buen estado | Sí |
| Unidades | «Prenda única» viene marcada (siempre 1). Si la desmarcas, escribes cuántas unidades hay (entero, mínimo 1) | Sí |
| Categorías | Puedes marcar varias | Sí |
| Talla | Lista: <XS, XS, S, M, L, XL, >XL (o «Sin talla») | Sí |
| Color(es) mayoritario(s) | Separados por coma | Sí |
| Fotos | Hasta 8; con ← → cambias el orden, la primera es la portada | Sí |
| Visible en la tienda | Mostrar u ocultar | — |
| **Vendedor** | Abigail, Luis, Montserrath o Juan (obligatorio) | **No** |
| **Disponibilidad** | Marcada = «No vendido». Desmarcada = «Vendido» | **No** |
| **Número de WhatsApp** | Uno de los números guardados en Ajustes | **No** (se usa al abrir el chat) |
| **Código (SKU)** | Automático (MS-0001…) si lo dejas vacío | **No** |

- **Vendido = oculto:** al desmarcar «No vendido», el producto pasa a **Oculto** automáticamente y deja de verse en la tienda. Si lo vuelves a marcar como «No vendido», recupera la visibilidad que tenía.
- La tabla muestra Vendedor, Estado, Unidades y la situación (Visible / Oculto / Vendido).
- Eliminar es definitivo y también borra sus fotos.

### Categorías
Pestaña `Categorías`: agrega, **edita el nombre** (`Editar nombre`; Enter guarda, Escape cancela) o elimina. Al renombrar, los productos conservan la categoría.

### Ajustes (números de WhatsApp)
Pestaña `Ajustes`: lista de números con **Nombre** y número. Puedes agregar, `Editar` (nombre y número) o eliminar. El primero es el principal: se usa en «Contáctanos» y en productos sin número asignado. Debe quedar al menos uno. Escribe el número con código de país (ej. 504 + 8 dígitos).

### Identificar un pedido
Cuando un cliente te escriba, toca el enlace «Ver producto» del mensaje. Con tu sesión abierta verás el código del producto.

Al terminar, `Cerrar sesión`, sobre todo en equipos compartidos.

## 3. Configuración inicial (una sola vez)
1. En Supabase > **SQL Editor**, ejecuta completo `supabase/schema.sql`. Se puede repetir sin perder datos.
2. En **Authentication > Users**, crea tu usuario administrador (correo + contraseña fuerte).
3. Ejecuta (con tu correo): `insert into public.admins (user_id) select id from auth.users where email = 'TU_CORREO';`
4. En **Authentication > Sign In / Providers > Email**, desactiva "Allow new users to sign up".
5. `js/config.js` ya trae la clave pública (publishable); los números reales se administran desde el panel.
6. GitHub Pages: Settings > Pages > Branch `main` / `/ (root)`.

## 4. Seguridad
- Solo se usa la clave pública. La clave `service_role` nunca va en el repo.
- Cualquiera puede leer el catálogo, pero solo los usuarios de la tabla `admins` pueden modificarlo.
- La base de datos **no entrega** a los visitantes el código (SKU), el vendedor, la disponibilidad ni el nombre de los números, aunque consulten la API directamente.
- Un producto vendido no puede quedar visible (lo impone la base de datos, no solo el panel).
- Las fotos reales las subes tú desde el panel.
