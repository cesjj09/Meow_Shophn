// Panel de administración: login + CRUD de productos, categorías y números de WhatsApp.
(function () {
  const { cfg, db, configurado, esc, precio, urlSegura, placeholder } = window.Meow;
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 2 * 1024 * 1024; // límite del bucket (después de reducir la foto)
  const LADO_MAX = 1280;              // las fotos se reducen a este tamaño antes de subir
  const MAX_FOTOS = 8;

  // Listas fijas (la base de datos solo acepta estos valores)
  const VENDEDORES = ["Abigail", "Luis", "Montserrath", "Juan"];
  const ESTADOS = ["Nuevo", "Semi-nuevo", "Buen estado"];
  const TALLAS = ["<XS", "XS", "S", "M", "L", "XL", ">XL"];

  let productos = [];
  let categorias = [];
  let numeros = [];      // [{ id, nombre, numero }] ordenados por id; el primero es el principal
  let editandoId = null;
  let editandoCat = null;
  let editandoNum = null;
  let visibleAntes = true; // para restaurar "Visible" si se desmarca "Vendido"
  let fotosForm = [];      // [{ tipo: "url"|"file", src, file? }] en el orden que se mostrará

  function toast(texto) {
    document.querySelectorAll(".toast").forEach((x) => x.remove()); // un solo aviso a la vez
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }
  function mostrarError(id, texto) {
    const el = $(id);
    el.textContent = texto || "";
    el.hidden = !texto;
  }
  const lista = (txt) => txt.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const opciones = (arr, vacio) =>
    (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : "") +
    arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

  // Convierte un error de Supabase en un mensaje que se pueda entender y corregir.
  function explicarError(error, contexto) {
    console.error(contexto, error);
    const code = error?.code || "";
    const msg = error?.message || String(error);
    if (code === "42501" || /row-level security|permission denied|not authorized/i.test(msg))
      return `Sin permiso en la base de datos (${code || "RLS"}). Cierra sesión y vuelve a entrar; si sigue, avisa al desarrollador.`;
    if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg))
      return `Falta una tabla o columna en Supabase: ${msg}`;
    if (/bucket not found/i.test(msg)) return "No existe el bucket de imágenes «productos».";
    if (code === "23505") return "Ya existe un registro con ese valor (duplicado).";
    if (code === "23514") return "Un dato no cumple las reglas permitidas.";
    if (/jwt|expired/i.test(msg)) return "Tu sesión venció. Cierra sesión y entra de nuevo.";
    return `${msg}${code ? ` (${code})` : ""}`;
  }

  // Si la URL pertenece a nuestro bucket, devuelve la ruta del archivo; si no, null.
  function rutaEnBucket(url) {
    const marca = `/storage/v1/object/public/${cfg.STORAGE_BUCKET}/`;
    const i = (url || "").indexOf(marca);
    return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
  }
  async function borrarImagenes(urls) {
    const rutas = (urls || []).map(rutaEnBucket).filter(Boolean);
    if (rutas.length) await db.storage.from(cfg.STORAGE_BUCKET).remove(rutas); // mejor esfuerzo
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
    const [c, p, n] = await Promise.all([
      db.from("categorias").select("*").order("nombre"),
      db.from("productos").select("*, producto_categorias(categoria_id)").order("created_at", { ascending: false }),
      db.from("numeros_whatsapp").select("*").order("id")
    ]);
    const fallo = c.error || p.error || n.error;
    if (fallo) { toast("Error al cargar: " + explicarError(fallo, "cargar")); return; }
    categorias = c.data;
    numeros = n.data;
    productos = p.data.map((x) => ({ ...x, cats: (x.producto_categorias || []).map((r) => r.categoria_id) }));
    pintarProductos();
    pintarCategorias();
    pintarNumeros();
  }

  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || "";
  const portadaDe = (p) => ((p.imagenes || []).map(urlSegura).filter(Boolean)[0]) || placeholder;
  const verNumero = (n) => `+${n.numero}`;

  function pintarProductos() {
    $("filas").innerHTML = productos.length
      ? productos.map((p) => {
        const situacion = !p.disponible
          ? `<span class="insignia off">Vendido</span>`
          : `<span class="insignia ${p.activo ? "" : "off"}">${p.activo ? "Visible" : "Oculto"}</span>`;
        return `
        <tr>
          <td><img src="${esc(portadaDe(p))}" alt=""></td>
          <td>${esc(p.sku)}</td>
          <td>${esc(p.nombre)}<div class="ayuda">${(p.imagenes || []).length} foto(s)</div></td>
          <td>${esc(p.cats.map(nombreCat).filter(Boolean).join(", ") || "—")}</td>
          <td>${esc(p.sexo)}</td>
          <td>${esc(p.vendedor || "—")}</td>
          <td>${esc(p.estado_producto)}</td>
          <td>${esc(p.unidades)}</td>
          <td>${esc(precio(p.precio))}</td>
          <td>${situacion}</td>
          <td class="acciones">
            <button class="btn sec chico" type="button" data-edit="${esc(p.id)}">Editar</button>
            <button class="btn peligro chico" type="button" data-del="${esc(p.id)}">Eliminar</button>
          </td>
        </tr>`;
      }).join("")
      : `<tr><td colspan="11">Aún no hay productos.</td></tr>`;
    $("filas").querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => abrirForm(b.dataset.edit)));
    $("filas").querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => eliminarProducto(b.dataset.del)));
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
  $("tab-aj").addEventListener("click", () => pestana("aj"));

  // Enter guarda y Escape cancela dentro de una fila en edición
  function atajosFila(fila, guardar, cancelar) {
    fila.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); guardar(); }
      if (e.key === "Escape") { e.stopPropagation(); cancelar(); }
    }));
  }

  // ---------- Categorías (se puede editar solo el nombre) ----------
  function pintarCategorias() {
    $("filas-cat").innerHTML = categorias.length
      ? categorias.map((c) => editandoCat === c.id
        ? `<tr data-fila-cat>
             <td><input value="${esc(c.nombre)}" maxlength="60" aria-label="Nombre de la categoría"></td>
             <td class="acciones">
               <button class="btn chico" type="button" data-savecat="${esc(c.id)}">Guardar</button>
               <button class="btn sec chico" type="button" data-cancelcat>Cancelar</button>
             </td></tr>`
        : `<tr><td>${esc(c.nombre)}</td>
             <td class="acciones">
               <button class="btn sec chico" type="button" data-editcat="${esc(c.id)}">Editar nombre</button>
               <button class="btn peligro chico" type="button" data-delcat="${esc(c.id)}">Eliminar</button>
             </td></tr>`).join("")
      : `<tr><td colspan="2">Aún no hay categorías.</td></tr>`;
    const box = $("filas-cat");
    box.querySelectorAll("[data-editcat]").forEach((b) => b.addEventListener("click", () => { editandoCat = Number(b.dataset.editcat); pintarCategorias(); }));
    box.querySelectorAll("[data-delcat]").forEach((b) => b.addEventListener("click", () => eliminarCategoria(Number(b.dataset.delcat))));
    const fila = box.querySelector("[data-fila-cat]");
    if (fila) {
      const cancelar = () => { editandoCat = null; pintarCategorias(); };
      const guardar = () => guardarCategoria(editandoCat, fila.querySelector("input").value);
      fila.querySelector("[data-savecat]").addEventListener("click", guardar);
      fila.querySelector("[data-cancelcat]").addEventListener("click", cancelar);
      atajosFila(fila, guardar, cancelar);
      const inp = fila.querySelector("input"); inp.focus(); inp.select();
    }
  }

  async function guardarCategoria(id, valor) {
    const nombre = valor.trim();
    const actual = categorias.find((c) => c.id === id);
    if (nombre.length < 2 || nombre.length > 60) { toast("El nombre debe tener entre 2 y 60 caracteres"); return; }
    if (actual && actual.nombre === nombre) { editandoCat = null; pintarCategorias(); return; }
    const { error } = await db.from("categorias").update({ nombre }).eq("id", id);
    if (error) {
      toast(error.code === "23505" ? "Ya existe una categoría con ese nombre" : "No se pudo renombrar: " + explicarError(error, "renombrar categoría"));
      return;
    }
    editandoCat = null;
    toast("Nombre de categoría actualizado");
    await cargar();
  }

  $("form-cat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("cat-nombre").value.trim();
    if (!nombre) return;
    const { error } = await db.from("categorias").insert({ nombre });
    if (error) {
      toast(error.code === "23505" ? "Ya existe una categoría con ese nombre" : "No se pudo agregar: " + explicarError(error, "agregar categoría"));
      return;
    }
    $("cat-nombre").value = "";
    toast("Categoría agregada");
    await cargar();
  });

  async function eliminarCategoria(id) {
    if (!confirm("¿Eliminar esta categoría? Los productos dejarán de tenerla.")) return;
    const { error } = await db.from("categorias").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar: " + explicarError(error, "eliminar categoría")); return; }
    toast("Categoría eliminada");
    await cargar();
  }

  // ---------- Números de WhatsApp (con nombre editable) ----------
  function pintarNumeros() {
    $("filas-num").innerHTML = numeros.length
      ? numeros.map((n, i) => editandoNum === n.id
        ? `<tr data-fila-num>
             <td><input data-nn value="${esc(n.nombre)}" maxlength="60" aria-label="Nombre del número"></td>
             <td><input data-nv value="${esc(n.numero)}" inputmode="numeric" aria-label="Número de WhatsApp"></td>
             <td class="acciones">
               <button class="btn chico" type="button" data-savenum>Guardar</button>
               <button class="btn sec chico" type="button" data-cancelnum>Cancelar</button>
             </td></tr>`
        : `<tr>
             <td>${esc(n.nombre)} ${i === 0 ? `<span class="insignia">Principal</span>` : ""}</td>
             <td>${esc(verNumero(n))}</td>
             <td class="acciones">
               <button class="btn sec chico" type="button" data-editnum="${esc(n.id)}">Editar</button>
               <button class="btn peligro chico" type="button" data-delnum="${esc(n.id)}">Eliminar</button>
             </td></tr>`).join("")
      : `<tr><td colspan="3">Aún no hay números. Agrega uno arriba.</td></tr>`;
    const box = $("filas-num");
    box.querySelectorAll("[data-editnum]").forEach((b) => b.addEventListener("click", () => { editandoNum = Number(b.dataset.editnum); pintarNumeros(); }));
    box.querySelectorAll("[data-delnum]").forEach((b) => b.addEventListener("click", () => eliminarNumero(Number(b.dataset.delnum))));
    const fila = box.querySelector("[data-fila-num]");
    if (fila) {
      const cancelar = () => { editandoNum = null; pintarNumeros(); };
      const guardar = () => guardarNumero(editandoNum, fila.querySelector("[data-nn]").value, fila.querySelector("[data-nv]").value);
      fila.querySelector("[data-savenum]").addEventListener("click", guardar);
      fila.querySelector("[data-cancelnum]").addEventListener("click", cancelar);
      atajosFila(fila, guardar, cancelar);
      const inp = fila.querySelector("[data-nn]"); inp.focus(); inp.select();
    }
  }

  function validarNumero(nombre, numeroTxt) {
    const n = nombre.trim();
    const d = numeroTxt.replace(/\D/g, "");
    if (n.length < 2 || n.length > 60) return { error: "El nombre debe tener entre 2 y 60 caracteres" };
    if (!/^\d{10,15}$/.test(d)) return { error: "Número no válido: incluye el código de país (ej. 504 + 8 dígitos)" };
    return { nombre: n, numero: d };
  }

  async function guardarNumero(id, nombreTxt, numeroTxt) {
    const v = validarNumero(nombreTxt, numeroTxt);
    if (v.error) { toast(v.error); return; }
    const { error } = await db.from("numeros_whatsapp").update({ nombre: v.nombre, numero: v.numero }).eq("id", id);
    if (error) {
      toast(error.code === "23505" ? "Ese número ya está guardado" : "No se pudo guardar: " + explicarError(error, "editar número"));
      return;
    }
    editandoNum = null;
    toast("Número actualizado");
    await cargar();
  }

  $("form-num").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = validarNumero($("num-nombre").value, $("num-numero").value);
    if (v.error) { toast(v.error); return; }
    const { error } = await db.from("numeros_whatsapp").insert({ nombre: v.nombre, numero: v.numero });
    if (error) {
      toast(error.code === "23505" ? "Ese número ya está guardado" : "No se pudo agregar: " + explicarError(error, "agregar número"));
      return;
    }
    $("num-nombre").value = ""; $("num-numero").value = "";
    toast("Número agregado");
    await cargar();
  });

  async function eliminarNumero(id) {
    if (numeros.length <= 1) { toast("Debe quedar al menos un número"); return; }
    const usados = productos.filter((p) => p.numero_id === id).length;
    const aviso = usados
      ? `¿Eliminar este número? ${usados} producto(s) lo usan y pasarán al número principal.`
      : "¿Eliminar este número?";
    if (!confirm(aviso)) return;
    const { error } = await db.from("numeros_whatsapp").delete().eq("id", id);
    if (error) { toast("No se pudo eliminar: " + explicarError(error, "eliminar número")); return; }
    toast("Número eliminado");
    await cargar();
  }

  // ---------- Fotos del formulario ----------
  function pintarMinis() {
    const box = $("f-minis");
    box.innerHTML = fotosForm.map((f, i) => `
      <div class="mini ${i === 0 ? "portada" : ""}">
        <img src="${esc(f.src)}" alt="Foto ${i + 1}">
        ${i === 0 ? `<span class="portada-tag">Portada</span>` : ""}
        <div class="acc">
          <button type="button" data-izq="${i}" aria-label="Mover a la izquierda" ${i === 0 ? "disabled" : ""}>←</button>
          <button type="button" data-quitar="${i}" aria-label="Quitar foto">✕</button>
          <button type="button" data-der="${i}" aria-label="Mover a la derecha" ${i === fotosForm.length - 1 ? "disabled" : ""}>→</button>
        </div>
      </div>`).join("");
    const mover = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= fotosForm.length) return;
      [fotosForm[i], fotosForm[j]] = [fotosForm[j], fotosForm[i]];
      pintarMinis();
    };
    box.querySelectorAll("[data-izq]").forEach((b) => b.addEventListener("click", () => mover(Number(b.dataset.izq), -1)));
    box.querySelectorAll("[data-der]").forEach((b) => b.addEventListener("click", () => mover(Number(b.dataset.der), 1)));
    box.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => {
      const f = fotosForm.splice(Number(b.dataset.quitar), 1)[0];
      if (f?.tipo === "file") URL.revokeObjectURL(f.src);
      pintarMinis();
    }));
  }

  $("f-img").addEventListener("change", () => {
    const archivos = [...$("f-img").files];
    for (const file of archivos) {
      if (fotosForm.length >= MAX_FOTOS) { toast(`Máximo ${MAX_FOTOS} fotos por producto`); break; }
      if (!file.type.startsWith("image/")) { toast(`«${file.name}» no es una imagen`); continue; }
      fotosForm.push({ tipo: "file", file, src: URL.createObjectURL(file) });
    }
    $("f-img").value = "";
    pintarMinis();
  });

  $("f-url-add").addEventListener("click", () => {
    const u = $("f-url").value.trim();
    if (!u) return;
    if (!urlSegura(u)) { toast("La URL de imagen no es válida"); return; }
    if (fotosForm.length >= MAX_FOTOS) { toast(`Máximo ${MAX_FOTOS} fotos por producto`); return; }
    fotosForm.push({ tipo: "url", src: urlSegura(u) });
    $("f-url").value = "";
    pintarMinis();
  });

  // ---------- Formulario de producto ----------
  $("f-estado").innerHTML = opciones(ESTADOS);
  $("f-vendedor").innerHTML = opciones(VENDEDORES, "Selecciona…");

  // Disponibilidad: marcada = "No vendido"; desmarcada = "Vendido" y el producto queda oculto.
  function aplicarDisponibilidad(inicial) {
    const disponible = $("f-disp").checked;
    $("f-disp-txt").textContent = disponible ? "No vendido" : "Vendido";
    if (!disponible) {
      if (!inicial) visibleAntes = $("f-activo").checked;
      $("f-activo").checked = false;
      $("f-activo").disabled = true;
      $("f-activo-ayuda").hidden = false;
    } else {
      $("f-activo").disabled = false;
      if (!inicial) $("f-activo").checked = visibleAntes;
      $("f-activo-ayuda").hidden = true;
    }
  }
  $("f-disp").addEventListener("change", () => aplicarDisponibilidad(false));

  function abrirForm(id) {
    editandoId = id || null;
    const p = productos.find((x) => x.id === id);
    mostrarError("f-error", "");
    $("f-titulo").textContent = p ? "Editar producto" : "Nuevo producto";
    $("f-cats").innerHTML = categorias.length
      ? categorias.map((c) => `
          <label><input type="checkbox" value="${esc(c.id)}" ${p?.cats.includes(c.id) ? "checked" : ""}> ${esc(c.nombre)}</label>`).join("")
      : `<span class="ayuda">Aún no hay categorías. Crea una en la pestaña Categorías.</span>`;
    $("f-nombre").value = p?.nombre || "";
    $("f-sku").value = p?.sku || "";
    $("f-precio").value = p?.precio ?? "";
    $("f-sexo").value = p?.sexo || "Unisex";
    $("f-estado").value = p?.estado_producto || "Nuevo";
    $("f-unidades").value = p?.unidades ?? 1;
    $("f-unica").checked = (p?.unidades ?? 1) === 1;
    sincronizarUnidades();
    $("f-desc").value = p?.descripcion || "";
    $("f-colores").value = (p?.colores || []).join(", ");

    // Talla: lista fija. Si el producto trae una talla fuera de la lista, se conserva como opción extra.
    const tallaActual = p?.tallas?.[0] || "";
    const extra = tallaActual && !TALLAS.includes(tallaActual) ? [tallaActual] : [];
    $("f-talla").innerHTML = opciones([...TALLAS, ...extra], "Sin talla");
    $("f-talla").value = tallaActual;
    $("f-talla-ayuda").hidden = !(p?.tallas?.length > 1);
    $("f-talla-ayuda").textContent = p?.tallas?.length > 1
      ? `Este producto tenía varias tallas (${p.tallas.join(", ")}). Al guardar se conservará solo la elegida.` : "";

    // Solo administración
    $("f-vendedor").value = p?.vendedor || "";
    $("f-numero").innerHTML =
      `<option value="">Principal (automático)</option>` +
      numeros.map((n) => `<option value="${esc(n.id)}">${esc(n.nombre)} · ${esc(verNumero(n))}</option>`).join("");
    $("f-numero").value = p ? (p.numero_id ?? "") : (numeros[0]?.id ?? "");

    $("f-url").value = "";
    $("f-img").value = "";
    visibleAntes = true;
    $("f-disp").checked = p ? p.disponible : true;
    $("f-activo").checked = p ? p.activo : true;
    aplicarDisponibilidad(true);

    fotosForm.forEach((f) => f.tipo === "file" && URL.revokeObjectURL(f.src));
    fotosForm = (p?.imagenes || []).map(urlSegura).filter(Boolean).map((src) => ({ tipo: "url", src }));
    pintarMinis();
    $("modal").classList.add("abierto");
    $("f-nombre").focus();
  }
  function cerrarForm() { $("modal").classList.remove("abierto"); }

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
      throw new Error(`No se pudo leer «${file.name}». Usa JPG, PNG o WebP (las fotos HEIC de iPhone: expórtalas como JPG).`);
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
    throw new Error(`La foto «${file.name}» sigue siendo demasiado pesada. Prueba con otra.`);
  }

  async function subirImagen(file) {
    const blob = await prepararImagen(file);
    const ruta = `${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from(cfg.STORAGE_BUCKET).upload(ruta, blob, {
      contentType: "image/jpeg", cacheControl: "31536000"
    });
    if (error) throw new Error("No se pudo subir la foto: " + explicarError(error, "subir imagen"));
    return db.storage.from(cfg.STORAGE_BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  $("form-prod").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarError("f-error", "");
    $("f-guardar").disabled = true;
    $("f-guardar").textContent = "Guardando…";
    const subidas = []; // fotos recién subidas (se borran si falla el guardado)
    const anteriores = editandoId ? (productos.find((x) => x.id === editandoId)?.imagenes || []) : [];
    try {
      const nombre = $("f-nombre").value.trim();
      const precioNum = Number($("f-precio").value);
      const unidades = $("f-unica").checked ? 1 : Number($("f-unidades").value);
      if (!nombre || $("f-precio").value === "" || !(precioNum >= 0)) throw new Error("Revisa nombre y precio.");
      if (!Number.isInteger(unidades) || unidades < 1) throw new Error("Las unidades deben ser un número entero de 1 o más.");
      if (!$("f-vendedor").value) throw new Error("Selecciona el vendedor.");

      // 1) Subir las fotos nuevas respetando el orden
      const imagenes = [];
      for (const f of fotosForm) {
        if (f.tipo === "file") {
          $("f-guardar").textContent = `Subiendo foto ${imagenes.length + 1}…`;
          const url = await subirImagen(f.file);
          subidas.push(url);
          imagenes.push(url);
        } else {
          imagenes.push(f.src);
        }
      }

      // 2) Guardar el producto. Si está vendido, siempre queda oculto.
      const disponible = $("f-disp").checked;
      const talla = $("f-talla").value;
      const datos = {
        nombre,
        descripcion: $("f-desc").value.trim(),
        precio: precioNum,
        sexo: $("f-sexo").value,
        estado_producto: $("f-estado").value,
        unidades,
        tallas: talla ? [talla] : [],
        colores: lista($("f-colores").value),
        imagenes,
        vendedor: $("f-vendedor").value,
        numero_id: $("f-numero").value ? Number($("f-numero").value) : null,
        disponible,
        activo: disponible ? $("f-activo").checked : false
      };
      const sku = $("f-sku").value.trim();
      if (sku) datos.sku = sku;

      $("f-guardar").textContent = "Guardando…";
      let id = editandoId;
      if (editandoId) {
        const { error } = await db.from("productos").update(datos).eq("id", editandoId);
        if (error) throw new Error(error.code === "23505" ? "Ese código (SKU) ya existe." : "No se pudo guardar: " + explicarError(error, "actualizar producto"));
      } else {
        const { data, error } = await db.from("productos").insert(datos).select("id").single();
        if (error) throw new Error(error.code === "23505" ? "Ese código (SKU) ya existe." : "No se pudo guardar: " + explicarError(error, "crear producto"));
        id = data.id;
      }
      subidas.length = 0; // el producto ya referencia las fotos: no borrarlas

      // 3) Categorías del producto
      const marcadas = [...$("f-cats").querySelectorAll("input:checked")].map((i) => Number(i.value));
      const { error: eDel } = await db.from("producto_categorias").delete().eq("producto_id", id);
      if (eDel) throw new Error("El producto se guardó, pero fallaron las categorías: " + explicarError(eDel, "limpiar categorías"));
      if (marcadas.length) {
        const { error: eIns } = await db.from("producto_categorias").insert(marcadas.map((c) => ({ producto_id: id, categoria_id: c })));
        if (eIns) throw new Error("El producto se guardó, pero fallaron las categorías: " + explicarError(eIns, "guardar categorías"));
      }

      // 4) Borrar de Storage las fotos que se quitaron
      await borrarImagenes(anteriores.filter((u) => !imagenes.includes(u)));

      cerrarForm();
      toast("Producto guardado");
      await cargar();
    } catch (err) {
      if (subidas.length) await borrarImagenes(subidas); // fotos huérfanas
      mostrarError("f-error", err.message);
      await cargar();
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
    await borrarImagenes(p.imagenes);
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
  // Prenda única: unidades fijas en 1; si se desmarca, el vendedor indica cuántas hay.
  function sincronizarUnidades() {
    const unica = $("f-unica").checked;
    const u = $("f-unidades");
    u.disabled = unica;
    if (unica) u.value = 1;
  }
  $("f-unica").addEventListener("change", sincronizarUnidades);

})();
