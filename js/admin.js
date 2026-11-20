// Panel de administración: login + CRUD de productos y categorías.
(function () {
  const { cfg, db, configurado, esc, precio, urlSegura, placeholder } = window.Meow;
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 2 * 1024 * 1024;
  const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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

  // ---------- Sesión ----------
  async function verificarAdmin(user) {
    const { data, error } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return !error && !!data;
  }

  async function mostrarSegunSesion() {
    const { data } = await db.auth.getSession();
    const user = data.session?.user;
    if (user && (await verificarAdmin(user))) {
      $("vista-login").hidden = true;
      $("vista-panel").hidden = false;
      $("quien").textContent = user.email;
      await cargar();
    } else {
      if (user) {
        await db.auth.signOut();
        mostrarError("login-error", "Tu usuario no tiene permisos de administrador.");
      }
      $("vista-panel").hidden = true;
      $("vista-login").hidden = false;
    }
  }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarError("login-error", "");
    $("btn-login").disabled = true;
    const { error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("pass").value
    });
    $("btn-login").disabled = false;
    if (error) {
      mostrarError("login-error", "Correo o contraseña incorrectos.");
      return;
    }
    $("pass").value = "";
    await mostrarSegunSesion();
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
    if (c.error || p.error) { toast("Error al cargar datos"); return; }
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
    if (error) { toast("No se pudo guardar"); return; }
    $("aj-wa").value = n;
    toast("Número de WhatsApp actualizado");
  });

  // ---------- Categorías ----------
  $("form-cat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("cat-nombre").value.trim();
    if (!nombre) return;
    const { error } = await db.from("categorias").insert({ nombre });
    if (error) { toast("No se pudo agregar (¿ya existe?)"); return; }
    $("cat-nombre").value = "";
    toast("Categoría agregada");
    await cargar();
  });

  async function eliminarCategoria(id) {
    if (!confirm("¿Eliminar esta categoría? Los productos quedarán sin categoría.")) return;
    const { error } = await db.from("categorias").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar"); return; }
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

  async function subirImagen(file) {
    if (!TIPOS[file.type]) throw new Error("La imagen debe ser JPG, PNG o WebP.");
    if (file.size > MAX_BYTES) throw new Error("La imagen supera los 2 MB.");
    const ruta = `${crypto.randomUUID()}.${TIPOS[file.type]}`;
    const { error } = await db.storage.from(cfg.STORAGE_BUCKET).upload(ruta, file, {
      contentType: file.type, cacheControl: "31536000"
    });
    if (error) throw new Error("No se pudo subir la imagen.");
    return db.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  $("form-prod").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarError("f-error", "");
    $("f-guardar").disabled = true;
    try {
      let imagen_url = $("f-url").value.trim() || null;
      if (imagen_url && !urlSegura(imagen_url)) throw new Error("La URL de imagen no es válida.");
      const file = $("f-img").files[0];
      if (file) imagen_url = await subirImagen(file);

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
      if (error) throw new Error(error.code === "23505" ? "Ese código (SKU) ya existe." : "No se pudo guardar.");

      cerrarForm();
      toast("Producto guardado");
      await cargar();
    } catch (err) {
      mostrarError("f-error", err.message);
    } finally {
      $("f-guardar").disabled = false;
    }
  });

  async function eliminarProducto(id) {
    const p = productos.find((x) => x.id === id);
    if (!p || !confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await db.from("productos").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar"); return; }
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
