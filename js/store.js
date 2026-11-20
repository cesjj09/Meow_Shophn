// Tienda pública: catálogo, filtros, detalle y botón de WhatsApp.
(function () {
  const { db, configurado, esc, precio, urlSegura, placeholder, enlaceWhatsApp } = window.Meow;
  const $ = (id) => document.getElementById(id);

  let productos = [];
  let categorias = [];
  let catActiva = null;
  let actual = null;

  $("anio").textContent = new Date().getFullYear();

  function imagen(p) {
    return (p.imagen_url && urlSegura(p.imagen_url)) || placeholder;
  }

  function nombreCategoria(id) {
    return categorias.find((c) => c.id === id)?.nombre || "";
  }

  function pintarChips() {
    const box = $("chips");
    box.innerHTML = "";
    const crear = (texto, id) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = texto;
      b.setAttribute("aria-pressed", String(catActiva === id));
      b.addEventListener("click", () => { catActiva = id; pintarChips(); pintarGrid(); });
      box.appendChild(b);
      box.appendChild(document.createTextNode(" "));
    };
    crear("Todo", null);
    categorias.forEach((c) => crear(c.nombre, c.id));
  }

  function pintarGrid() {
    const q = $("buscar").value.trim().toLowerCase();
    const lista = productos.filter((p) =>
      (catActiva === null || p.categoria_id === catActiva) &&
      (!q || p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
    const grid = $("grid");
    if (!lista.length) {
      grid.innerHTML = `<div class="estado">No encontramos productos 🐾</div>`;
      return;
    }
    grid.innerHTML = lista.map((p) => `
      <article class="card">
        <button class="foto" data-sku="${esc(p.sku)}" aria-label="Ver ${esc(p.nombre)}">
          <img src="${esc(imagen(p))}" alt="${esc(p.nombre)}" loading="lazy">
        </button>
        <div class="cuerpo">
          <span class="sku">${esc(p.sku)}</span>
          <h3>${esc(p.nombre)}</h3>
          <div class="precio">${esc(precio(p.precio))}</div>
          <button class="btn chico" data-sku="${esc(p.sku)}">Ver y comprar</button>
        </div>
      </article>`).join("");
    grid.querySelectorAll("[data-sku]").forEach((el) =>
      el.addEventListener("click", () => abrir(el.dataset.sku)));
  }

  function llenarSelect(sel, wrap, valores) {
    wrap.style.display = valores?.length ? "" : "none";
    sel.innerHTML = (valores || []).map((v) => `<option>${esc(v)}</option>`).join("");
  }

  function actualizarWA() {
    if (!actual) return;
    const talla = $("m-talla-wrap").style.display === "none" ? "" : $("m-talla").value;
    const color = $("m-color-wrap").style.display === "none" ? "" : $("m-color").value;
    $("m-wa").href = enlaceWhatsApp(actual, talla, color);
  }

  function abrir(sku) {
    const p = productos.find((x) => x.sku === sku);
    if (!p) return;
    actual = p;
    $("m-img").src = imagen(p);
    $("m-img").alt = p.nombre;
    $("m-cat").textContent = nombreCategoria(p.categoria_id) || "Meow Shop HN";
    $("m-titulo").textContent = p.nombre;
    $("m-sku").textContent = `Código: ${p.sku}`;
    $("m-precio").textContent = precio(p.precio);
    $("m-desc").textContent = p.descripcion;
    llenarSelect($("m-talla"), $("m-talla-wrap"), p.tallas);
    llenarSelect($("m-color"), $("m-color-wrap"), p.colores);
    actualizarWA();
    $("modal").classList.add("abierto");
    history.replaceState(null, "", `?sku=${encodeURIComponent(p.sku)}`);
  }

  function cerrar() {
    $("modal").classList.remove("abierto");
    actual = null;
    history.replaceState(null, "", location.pathname);
  }

  $("cerrar").addEventListener("click", cerrar);
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  $("m-talla").addEventListener("change", actualizarWA);
  $("m-color").addEventListener("change", actualizarWA);
  $("buscar").addEventListener("input", pintarGrid);

  async function iniciar() {
    if (!configurado) {
      $("aviso").innerHTML = `<div class="aviso"><b>Falta configurar Supabase.</b> Edita <code>js/config.js</code> y pega tu clave <i>anon</i> pública.</div>`;
      $("grid").innerHTML = "";
      return;
    }
    $("grid").innerHTML = `<div class="estado">Cargando catálogo…</div>`;
    await window.Meow.cargarWhatsApp();
    const [cats, prods] = await Promise.all([
      db.from("categorias").select("id,nombre").order("nombre"),
      db.from("productos").select("*").eq("activo", true).order("created_at", { ascending: false })
    ]);
    if (cats.error || prods.error) {
      $("grid").innerHTML = `<div class="estado">No se pudo cargar el catálogo. Intenta más tarde.</div>`;
      return;
    }
    categorias = cats.data;
    productos = prods.data;
    pintarChips();
    pintarGrid();
    // Enlace directo desde WhatsApp: ?sku=MS-0001
    const sku = new URLSearchParams(location.search).get("sku");
    if (sku) abrir(sku);
  }
  iniciar();
})();
