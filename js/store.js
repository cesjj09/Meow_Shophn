// Tienda pública: navegación, catálogo, filtros, detalle y botón de WhatsApp.
(function () {
  const { db, configurado, esc, precio, norm, urlSegura, placeholder, enlaceWhatsApp, enlaceContacto, cargarNumeros } = window.Meow;
  const $ = (id) => document.getElementById(id);

  // Columnas públicas. El código (sku) NO está aquí: la base de datos no lo entrega a visitantes.
  // Tampoco están vendedor ni disponibilidad: son internos del administrador.
  const COLS = "id,nombre,descripcion,precio,sexo,tallas,colores,imagenes,activo,created_at,estado_producto,unidades,numero_id,producto_categorias(categoria_id)";

  let productos = [];
  let categorias = [];
  let esAdmin = false;
  let catActiva = null;     // al volver a tocar la categoría, se desactiva
  let sexoActivo = null;
  let filtros = { q: "", min: null, max: null };
  let actual = null;
  let ultimoFoco = null;

  $("anio").textContent = new Date().getFullYear();

  // ---------- Menú hamburguesa ----------
  const hamb = $("hamb"), menu = $("menu");
  function menuAbrir(abrir) {
    menu.classList.toggle("abierto", abrir);
    hamb.setAttribute("aria-expanded", String(abrir));
    hamb.setAttribute("aria-label", abrir ? "Cerrar menú" : "Abrir menú");
  }
  hamb.addEventListener("click", () => menuAbrir(!menu.classList.contains("abierto")));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => menuAbrir(false)));
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !hamb.contains(e.target)) menuAbrir(false);
  });

  // ---------- Datos auxiliares ----------
  const fotos = (p) => (p.imagenes || []).map(urlSegura).filter(Boolean);
  const portada = (p) => fotos(p)[0] || placeholder;
  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || "";

  // ---------- Categorías y preferencias (lista horizontal con scroll) ----------
  function pintarChips() {
    const box = $("chips");
    const usadas = new Set(productos.flatMap((p) => p.cats));
    const cats = categorias.filter((c) => usadas.has(c.id));
    const sexos = [...new Set(productos.map((p) => p.sexo))].sort();
    box.innerHTML = "";
    const crear = (texto, activo, alClick, cuenta) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = esc(texto) + (cuenta !== undefined ? ` <span class="cuenta" aria-label="${cuenta} productos">${cuenta}</span>` : "");
      b.setAttribute("aria-pressed", String(activo));
      b.addEventListener("click", alClick);
      box.appendChild(b);
    };
    // Contador: cuántos productos visibles tiene cada categoría
    const cuentaDe = (id) => productos.filter((p) => p.cats.includes(id)).length;
    cats.forEach((c) => crear(c.nombre, catActiva === c.id, () => {
      catActiva = catActiva === c.id ? null : c.id; // clic de nuevo = desactivar
      pintarChips(); pintarGrid();
    }, cuentaDe(c.id)));
    if (cats.length && sexos.length) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.setAttribute("aria-hidden", "true");
      box.appendChild(sep);
    }
    sexos.forEach((s) => crear(s, sexoActivo === s, () => {
      sexoActivo = sexoActivo === s ? null : s;
      pintarChips(); pintarGrid();
    }));
  }

  // ---------- Tarjetas ----------
  function filtrados() {
    const q = norm(filtros.q);
    return productos.filter((p) =>
      (!q || norm(p.nombre).includes(q)) &&
      (filtros.min === null || p.precio >= filtros.min) &&
      (filtros.max === null || p.precio <= filtros.max) &&
      (catActiva === null || p.cats.includes(catActiva)) &&
      (sexoActivo === null || p.sexo === sexoActivo)
    );
  }

  function pintarGrid() {
    const grid = $("productos");
    if (!productos.length) {
      grid.innerHTML = `<div class="estado">Pronto tendremos prendas nuevas 🐾</div>`;
      return;
    }
    const lista = filtrados();
    if (!lista.length) {
      grid.innerHTML = `<div class="estado">No encontramos productos con esos filtros 🐾</div>`;
      return;
    }
    grid.innerHTML = lista.map((p) => `
      <a class="card" href="?p=${encodeURIComponent(p.id)}#catalogo" data-id="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
        <div class="foto"><img src="${esc(portada(p))}" alt="${esc(p.nombre)}" loading="lazy"></div>
        ${fotos(p).length > 1 ? `<span class="nfotos">${fotos(p).length} fotos</span>` : ""}
        <div class="cuerpo">
          ${esAdmin && p.sku ? `<span class="codigo-admin">${esc(p.sku)}</span>` : ""}
          <h3>${esc(p.nombre)}</h3>
          <div class="precio">${esc(precio(p.precio))}</div>
        </div>
      </a>`).join("");
    grid.querySelectorAll(".card").forEach((a) =>
      a.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // dejar abrir en pestaña nueva
        e.preventDefault();
        abrir(a.dataset.id, a);
      }));
  }

  // ---------- Buscador: Aplicar / Restablecer ----------
  function numeroOnull(v) {
    const t = String(v).trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  $("buscador").addEventListener("submit", (e) => {
    e.preventDefault();
    filtros = { q: $("f-nombre").value, min: numeroOnull($("f-min").value), max: numeroOnull($("f-max").value) };
    pintarGrid();
  });
  // El nombre se busca al escribir, sin necesidad de pulsar Aplicar (el precio sí usa Aplicar).
  $("f-nombre").addEventListener("input", () => {
    filtros = { ...filtros, q: $("f-nombre").value };
    pintarGrid();
  });
  $("btn-restablecer").addEventListener("click", () => {
    $("buscador").reset();
    filtros = { q: "", min: null, max: null };
    catActiva = null;
    sexoActivo = null;
    pintarChips();
    pintarGrid();
  });

  // ---------- Detalle ----------
  // Talla: texto si el producto tiene una sola; lista para elegir si (por datos antiguos) tiene varias.
  function pintarTalla(p) {
    const t = p.tallas || [];
    $("m-talla-wrap").hidden = !t.length;
    $("m-talla-txt").hidden = t.length > 1;
    $("m-talla").hidden = t.length <= 1;
    $("m-talla-txt").textContent = t[0] || "";
    $("m-talla").innerHTML = t.map((v) => `<option>${esc(v)}</option>`).join("");
  }

  function actualizarWA() {
    if (!actual) return;
    const t = actual.tallas || [];
    const talla = t.length > 1 ? $("m-talla").value : (t[0] || "");
    const colores = (actual.colores || []).join(", ");
    $("m-wa").href = enlaceWhatsApp(actual, talla, colores);
  }

  function abrir(id, origen) {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    actual = p;
    ultimoFoco = origen || document.activeElement;
    const lista = fotos(p);
    $("m-collage").innerHTML = (lista.length ? lista : [placeholder])
      .map((u, i) => `<img src="${esc(u)}" alt="${esc(p.nombre)} — foto ${i + 1}" loading="${i ? "lazy" : "eager"}">`).join("");
    $("m-collage").scrollTo(0, 0);
    $("m-nombre").textContent = p.nombre;
    $("m-precio").textContent = precio(p.precio);
    $("m-desc").textContent = p.descripcion || "";
    $("m-desc").hidden = !p.descripcion;
    $("m-cats").textContent = p.cats.map(nombreCat).filter(Boolean).join(", ") || "—";
    $("m-sexo").textContent = p.sexo;
    $("m-codigo").hidden = !(esAdmin && p.sku);
    $("m-codigo").textContent = p.sku ? `Código: ${p.sku} (solo administrador)` : "";
    $("m-estado").textContent = p.estado_producto || "—";
    $("m-unidades").textContent = p.unidades ?? 1;
    pintarTalla(p);
    $("m-color-wrap").hidden = !(p.colores || []).length;
    $("m-colores").textContent = (p.colores || []).join(", ");
    actualizarWA();
    $("modal").classList.add("abierto");
    document.body.style.overflow = "hidden";
    history.replaceState(null, "", `?p=${encodeURIComponent(p.id)}#catalogo`);
    $("cerrar").focus();
  }

  function cerrar() {
    if (!$("modal").classList.contains("abierto")) return;
    $("modal").classList.remove("abierto");
    document.body.style.overflow = "";
    actual = null;
    history.replaceState(null, "", location.pathname + "#catalogo");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  $("cerrar").addEventListener("click", cerrar);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  $("m-talla").addEventListener("change", actualizarWA);

  // ---------- Si el administrador tiene sesión, puede ver los códigos ----------
  async function detectarAdmin() {
    try {
      const { data } = await db.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      const { data: fila } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!fila) return;
      const { data: skus } = await db.from("productos").select("id,sku");
      if (!skus) return;
      esAdmin = true;
      const mapa = new Map(skus.map((s) => [s.id, s.sku]));
      productos.forEach((p) => { p.sku = mapa.get(p.id); });
      pintarGrid();
      if (actual) abrir(actual.id, ultimoFoco);
    } catch (err) { console.warn("No se pudo verificar sesión de admin", err); }
  }

  // ---------- Inicio ----------
  async function iniciar() {
    if (!configurado) {
      $("aviso").innerHTML = `<div class="aviso"><b>Falta configurar Supabase.</b> Edita <code>js/config.js</code> y pega tu clave pública.</div>`;
      return;
    }
    $("productos").innerHTML = `<div class="estado">Cargando catálogo…</div>`;
    await cargarNumeros();
    $("contacto-wa").href = enlaceContacto();

    const [cats, prods] = await Promise.all([
      db.from("categorias").select("id,nombre").order("nombre"),
      db.from("productos").select(COLS).eq("activo", true).order("created_at", { ascending: false })
    ]);
    if (cats.error || prods.error) {
      console.error(cats.error || prods.error);
      $("productos").innerHTML = `<div class="estado">No se pudo cargar el catálogo. Intenta más tarde.</div>`;
      return;
    }
    categorias = cats.data;
    productos = prods.data.map((p) => ({
      ...p,
      precio: Number(p.precio),
      cats: (p.producto_categorias || []).map((x) => x.categoria_id)
    }));
    pintarChips();
    pintarGrid();

    // Enlace directo desde WhatsApp: ?p=<id del producto>
    const id = new URLSearchParams(location.search).get("p");
    if (id) abrir(id);
    detectarAdmin();
  }
  iniciar();
})();
