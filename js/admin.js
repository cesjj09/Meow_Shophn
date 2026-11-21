// Panel de administración: login + CRUD de productos y categorías.
(function () {
  const { cfg, db, configurado, esc, precio, urlSegura, placeholder } = window.Meow;
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 2 * 1024 * 1024; // límite del bucket (después de reducir la foto)
  const LADO_MAX = 1280;              // las fotos se reducen a este tamaño antes de subir

  let productos = [];
  let categorias = [];
  let editandoId = null;

  function toast(texto) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function mostrarError(id, texto) {
    const el = $(id);
    el.textContent = texto || "";
    el.hidden = !texto;
  }
  const lista = (txt) => txt.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);

  // Convierte un error de Supabase en un mensaje que se pueda entender y corregir.
  function explicarError(error, contexto) {
    console.error(contexto, error);
    const code = error?.code || "";
    const msg = error?.message || String(error);
    if (code === "42501" || /row-level security|permission denied|not authorized/i.test(msg))
      return `Sin permiso en la base de datos (${code || "RLS"}). Ejecuta supabase/schema.sql completo en el SQL Editor.`;
    if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg))
      return `Falta una tabla en Supabase: ${msg}`;
    if (/bucket not found/i.test(msg))
      return "No existe el bucket de imágenes «productos». Ejecuta supabase/schema.sql.";
    if (code === "23505") return "Ya existe un registro con ese valor (duplicado).";
    if (code === "23514") return "Un dato no cumple las reglas (revisa longitud del nombre y precio).";
    if (/jwt|expired/i.test(msg)) return "Tu sesión venció. Cierra sesión y entra de nuevo.";
    return `${msg}${code ? ` (${code})` : ""}`;
  }

  // Si la URL pertenece a nuestro bucket, devuelve la ruta del archivo; si no, null.
  function rutaEnBucket(url) {
    const marca = `/storage/v1/object/public/${cfg.STORAGE_BUCKET}/`;
    const i = (url || "").indexOf(marca);
    return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
  }
  async function borrarImagen(url) {
    const ruta = rutaEnBucket(url);
    if (ruta) await db.storage.from(cfg.STORAGE_BUCKET).remove([ruta]); // mejor esfuerzo
  }

  // ---------- Sesión ----------
  async function verificarAdmin(user) {
    const { data, error } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) {
      console.error("Error al verificar administrador:", error);
      return { ok: false, detalle: error.message };
    }
    return { ok: !!data, detalle: "" };
  }

  async function mostrarSegunSesion() {
    const { data } = await db.auth.getSession();
    const user = data.session?.user;
    const chequeo = user ? await verificarAdmin(user) : { ok: false };
    if (user && chequeo.ok) {
      $("vista-login").hidden = true;
      $("vista-panel").hidden = false;
      $("quien").textContent = user.email;
      await cargar();
    } else {
      if (user) {
        await db.auth.signOut();
        mostrarError("login-error", chequeo.detalle
          ? `No se pudo verificar tu permiso (${chequeo.detalle}). Revisa los permisos de la base de datos.`
          : "Tu usuario no tiene permisos de administrador.");
      }
      $("vista-panel").hidden = true;
      $("vista-login").hidden = false;
    }
  }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarError("login-error", "");
    $("btn-login").disabled = true;
    $("btn-login").textContent = "Entrando…";
    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("pass").value
      });
      if (error) {
        console.error("Error de login:", error);
        mostrarError("login-error",
          /confirm/i.test(error.message)
            ? "Tu correo aún no está confirmado en Supabase."
            : `No se pudo iniciar sesión: ${error.message}`);
        return;
      }
      $("pass").value = "";
      await mostrarSegunSesion();
    } catch (err) {
      console.error("Error inesperado:", err);
      mostrarError("login-error", `Error inesperado: ${err.message || err}`);
    } finally {
      $("btn-login").disabled = false;
      $("btn-login").textContent = "Entrar";
    }
  });

  $("salir").addEventListener("click", async () => {
    await db.auth.signOut();
    await mostrarSegunSesion();
  });

  // ---------- Datos ----------
  async function cargar() {
    const [c, p] = await Promise.all([
      db.from("categorias").select("*").order("nombre"),
      db.from("productos").select("*").order("created_at", { ascending: false })
    ]);
    if (c.error || p.error) { toast("Error al cargar: " + explicarError(c.error || p.error, "cargar")); return; }
    categorias = c.data;
    productos = p.data;
    pintarProductos();
    pintarCategorias();
  }

  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || "—";

  function pintarProductos() {
    $("filas").innerHTML = productos.length
      ? productos.map((p) => `
        <tr>
          <td><img src="${esc((p.imagen_url && urlSegura(p.imagen_url)) || placeholder)}" alt=""></td>
          <td>${esc(p.sku)}</td>
          <td>${esc(p.nombre)}</td>
          <td>${esc(nombreCat(p.categoria_id))}</td>
          <td>${esc(precio(p.precio))}</td>
          <td><span class="insignia ${p.activo ? "" : "off"}">${p.activo ? "Visible" : "Oculto"}</span></td>
          <td class="acciones">
            <button class="btn sec chico" data-edit="${esc(p.id)}">Editar</button>
            <button class="btn peligro chico" data-del="${esc(p.id)}">Eliminar</button>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="7">Aún no hay productos.</td></tr>`;
    $("filas").querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => abrirForm(b.dataset.edit)));
    $("filas").querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => eliminarProducto(b.dataset.del)));
  }

  function pintarCategorias() {
    $("filas-cat").innerHTML = categorias.map((c) => `
      <tr><td>${esc(c.nombre)}</td>
      <td class="acciones"><button class="btn peligro chico" data-delcat="${esc(c.id)}">Eliminar</button></td></tr>`).join("");
    $("filas-cat").querySelectorAll("[data-delcat]").forEach((b) =>
      b.addEventListener("click", () => eliminarCategoria(Number(b.dataset.delcat))));
  }

  // ---------- Pestañas ----------
  function pestana(cual) {
    $("sec-prod").hidden = cual !== "prod";
    $("sec-cat").hidden = cual !== "cat";
    $("sec-aj").hidden = cual !== "aj";
    $("nuevo").hidden = cual !== "prod";
    $("tab-prod").setAttribute("aria-pressed", String(cual === "prod"));
    $("tab-cat").setAttribute("aria-pressed", String(cual === "cat"));
    $("tab-aj").setAttribute("aria-pressed", String(cual === "aj"));
  }
  $("tab-prod").addEventListener("click", () => pestana("prod"));
  $("tab-cat").addEventListener("click", () => pestana("cat"));
  $("tab-aj").addEventListener("click", async () => {
    pestana("aj");
    $("aj-wa").value = await window.Meow.cargarWhatsApp();
  });

  // ---------- Ajustes: número de WhatsApp ----------
  $("form-aj").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = $("aj-wa").value.replace(/\D/g, "");
    if (n.length < 10 || n.length > 15) { toast("Número no válido (incluye código de país)"); return; }
    const { error } = await db.from("configuracion").upsert({ clave: "whatsapp", valor: n });
    if (error) { toast("No se pudo guardar: " + explicarError(error, "guardar whatsapp")); return; }
    $("aj-wa").value = n;
    toast("Número de WhatsApp actualizado");
  });

  // ---------- Categorías ----------
  $("form-cat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("cat-nombre").value.trim();
    if (!nombre) return;
    const { error } = await db.from("categorias").insert({ nombre });
    if (error) { toast("No se pudo agregar: " + explicarError(error, "agregar categoría")); return; }
    $("cat-nombre").value = "";
    toast("Categoría agregada");
    await cargar();
  });

  async function eliminarCategoria(id) {
    if (!confirm("¿Eliminar esta categoría? Los productos quedarán sin categoría.")) return;
    const { error } = await db.from("categorias").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar: " + explicarError(error, "eliminar categoría")); return; }
    toast("Categoría eliminada");
    await cargar();
  }

  // ---------- Formulario de producto ----------
  function abrirForm(id) {
    editandoId = id || null;
    const p = productos.find((x) => x.id === id);
    mostrarError("f-error", "");
    $("f-titulo").textContent = p ? "Editar producto" : "Nuevo producto";
    $("f-cat").innerHTML =
      `<option value="">Sin categoría</option>` +
      categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("");
    $("f-nombre").value = p?.nombre || "";
    $("f-sku").value = p?.sku || "";
    $("f-precio").value = p?.precio ?? "";
    $("f-cat").value = p?.categoria_id ?? "";
    $("f-desc").value = p?.descripcion || "";
    $("f-tallas").value = (p?.tallas || []).join(", ");
    $("f-colores").value = (p?.colores || []).join(", ");
    $("f-url").value = p?.imagen_url || "";
    $("f-img").value = "";
    $("f-activo").checked = p ? p.activo : true;
    vistaPrevia(p?.imagen_url);
    $("modal").classList.add("abierto");
    $("f-nombre").focus();
  }
  function cerrarForm() { $("modal").classList.remove("abierto"); }

  function vistaPrevia(src) {
    const img = $("f-prev");
    const ok = src && (src.startsWith("blob:") || urlSegura(src));
    img.hidden = !ok;
    if (ok) img.src = src;
  }
  $("f-img").addEventListener("change", () => {
    const f = $("f-img").files[0];
    if (f) vistaPrevia(URL.createObjectURL(f));
  });
  $("f-url").addEventListener("change", () => vistaPrevia($("f-url").value.trim()));
  $("nuevo").addEventListener("click", () => abrirForm(null));
  $("f-cancelar").addEventListener("click", cerrarForm);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarForm(); });

  // Reduce la foto (máx. 1280 px) y la convierte a JPG para que siempre quepa en 2 MB.
  async function prepararImagen(file) {
    if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen.");
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new Error("No se pudo leer la foto. Usa JPG, PNG o WebP (las fotos HEIC de iPhone: expórtalas como JPG).");
    }
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    for (const calidad of [0.85, 0.7, 0.5]) {
      const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("La foto sigue siendo demasiado pesada. Prueba con otra.");
  }

  async function subirImagen(file) {
    const blob = await prepararImagen(file);
    const ruta = `${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from(cfg.STORAGE_BUCKET).upload(ruta, blob, {
      contentType: "image/jpeg", cacheControl: "31536000"
    });
    if (error) throw new Error("No se pudo subir la foto: " + explicarError(error, "subir imagen"));
    return {
      ruta,
      url: db.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(ruta).data.publicUrl
    };
  }

  $("form-prod").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarError("f-error", "");
    $("f-guardar").disabled = true;
    $("f-guardar").textContent = "Guardando…";
    let subida = null; // foto recién subida (se borra si falla el guardado)
    const anterior = editandoId ? productos.find((x) => x.id === editandoId)?.imagen_url : null;
    try {
      let imagen_url = $("f-url").value.trim() || null;
      if (imagen_url && !urlSegura(imagen_url)) throw new Error("La URL de imagen no es válida.");
      const file = $("f-img").files[0];
      if (file) {
        subida = await subirImagen(file);
        imagen_url = subida.url;
      }

      const datos = {
        nombre: $("f-nombre").value.trim(),
        descripcion: $("f-desc").value.trim(),
        precio: Number($("f-precio").value),
        categoria_id: $("f-cat").value ? Number($("f-cat").value) : null,
        tallas: lista($("f-tallas").value),
        colores: lista($("f-colores").value),
        imagen_url,
        activo: $("f-activo").checked
      };
      const sku = $("f-sku").value.trim();
      if (sku) datos.sku = sku;
      if (!datos.nombre || !(datos.precio >= 0)) throw new Error("Revisa nombre y precio.");

      const { error } = editandoId
        ? await db.from("productos").update(datos).eq("id", editandoId)
        : await db.from("productos").insert(datos);
      if (error) {
        throw new Error(error.code === "23505"
          ? "Ese código (SKU) ya existe."
          : "No se pudo guardar: " + explicarError(error, "guardar producto"));
      }
      // Si se cambió la foto, borra la anterior para no acumular archivos.
      if (subida && anterior && anterior !== imagen_url) await borrarImagen(anterior);
      subida = null;

      cerrarForm();
      toast("Producto guardado");
      await cargar();
    } catch (err) {
      if (subida) await borrarImagen(subida.url); // la foto quedó huérfana
      mostrarError("f-error", err.message);
    } finally {
      $("f-guardar").disabled = false;
      $("f-guardar").textContent = "Guardar";
    }
  });

  async function eliminarProducto(id) {
    const p = productos.find((x) => x.id === id);
    if (!p || !confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await db.from("productos").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar: " + explicarError(error, "eliminar producto")); return; }
    await borrarImagen(p.imagen_url);
    toast("Producto eliminado");
    await cargar();
  }

  // ---------- Inicio ----------
  if (!configurado) {
    $("vista-login").hidden = false;
    $("form-login").innerHTML =
      `<h1>Falta configurar</h1><p>Edita <code>js/config.js</code> y pega tu clave <i>anon</i> pública de Supabase.</p>`;
  } else {
    mostrarSegunSesion();
  }
})();
