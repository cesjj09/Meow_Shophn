// Utilidades compartidas por la tienda y el panel.
(function () {
  const cfg = window.MEOW_CONFIG;

  const configurado =
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("PEGA_AQUI");

  const db = configurado
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  // Escapa texto antes de insertarlo como HTML (evita XSS).
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function precio(n) {
    return `${cfg.CURRENCY} ${Number(n).toLocaleString("es-HN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
  }

  // Minúsculas y sin tildes, para buscar "pantalon" y encontrar "Pantalón".
  function norm(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  // Solo permite URLs http(s) para imágenes.
  function urlSegura(u) {
    try {
      const x = new URL(u);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
    } catch { return ""; }
  }

  // Imagen de reemplazo (SVG con colores de la marca) cuando no hay foto.
  const placeholder =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'>
        <rect width='400' height='500' fill='#F6C8CC'/>
        <g fill='#FFF7EE'>
          <ellipse cx='200' cy='290' rx='62' ry='50'/>
          <ellipse cx='128' cy='215' rx='24' ry='30'/>
          <ellipse cx='176' cy='180' rx='24' ry='32'/>
          <ellipse cx='224' cy='180' rx='24' ry='32'/>
          <ellipse cx='272' cy='215' rx='24' ry='30'/>
        </g>
        <text x='200' y='420' text-anchor='middle' font-family='sans-serif' font-size='26' fill='#241D1E'>Meow Shop HN</text>
      </svg>`
    );

  // ---------- Números de WhatsApp ----------
  // Lista pública: solo id y número (el nombre del número es interno y no se entrega a visitantes).
  const respaldo = String(cfg.WHATSAPP_NUMBER).replace(/\D/g, "");
  let numeros = []; // [{ id, numero }] ordenados por id; el primero es el principal

  async function cargarNumeros() {
    if (!db) return numeros;
    const { data, error } = await db.from("numeros_whatsapp").select("id,numero").order("id");
    if (!error && data?.length) {
      numeros = data.map((n) => ({ id: n.id, numero: String(n.numero).replace(/\D/g, "") }));
    }
    return numeros;
  }

  const numeroPrincipal = () => numeros[0]?.numero || respaldo;

  // Número asignado al producto; si no tiene (o se borró), el principal.
  function numeroDe(p) {
    return numeros.find((n) => n.id === p?.numero_id)?.numero || numeroPrincipal();
  }

  // El código interno (SKU) es secreto para los clientes. El producto se identifica
  // por nombre + enlace directo + foto; el vendedor ve el código al abrir el enlace con su sesión.
  function mensajeWhatsApp(p, talla, colores) {
    const enlace = `${cfg.SITE_URL}?p=${encodeURIComponent(p.id)}#catalogo`;
    const foto = p.imagenes?.[0] ? urlSegura(p.imagenes[0]) : "";
    return [
      "¡Hola, Meow Shop HN! 🐾 Me interesa este producto:",
      "",
      `• Producto: ${p.nombre}`,
      talla ? `• Talla: ${talla}` : null,
      colores ? `• Color(es): ${colores}` : null,
      `• Precio: ${precio(p.precio)}`,
      `• Ver producto: ${enlace}`,
      foto ? `• Foto: ${foto}` : null,
      "",
      "¿Está disponible?"
    ].filter((l) => l !== null).join("\n");
  }

  function enlaceWhatsApp(p, talla, colores) {
    return `https://wa.me/${numeroDe(p)}?text=${encodeURIComponent(mensajeWhatsApp(p, talla, colores))}`;
  }

  function enlaceContacto() {
    return `https://wa.me/${numeroPrincipal()}?text=${encodeURIComponent("¡Hola, Meow Shop HN! 🐾 Quisiera más información.")}`;
  }

  window.Meow = {
    cfg, db, configurado, esc, precio, norm, urlSegura, placeholder,
    enlaceWhatsApp, enlaceContacto, cargarNumeros
  };
})();
