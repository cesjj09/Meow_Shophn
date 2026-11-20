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

  function mensajeWhatsApp(p, talla, color) {
    const enlace = `${cfg.SITE_URL}?sku=${encodeURIComponent(p.sku)}`;
    const lineas = [
      "¡Hola, Meow Shop HN! 🐾 Me interesa este producto:",
      "",
      `• Producto: ${p.nombre}`,
      `• Código: ${p.sku}`,
      talla ? `• Talla: ${talla}` : null,
      color ? `• Color: ${color}` : null,
      `• Precio: ${precio(p.precio)}`,
      `• Enlace: ${enlace}`,
      "",
      "¿Está disponible?"
    ].filter((l) => l !== null);
    return lineas.join("\n");
  }

  let numeroWA = String(cfg.WHATSAPP_NUMBER).replace(/\D/g, "");

  // Lee el número guardado en Supabase (editable desde el panel).
  async function cargarWhatsApp() {
    if (!db) return numeroWA;
    const { data } = await db.from("configuracion").select("valor").eq("clave", "whatsapp").maybeSingle();
    const n = String(data?.valor || "").replace(/\D/g, "");
    if (n.length >= 8) numeroWA = n;
    return numeroWA;
  }

  function enlaceWhatsApp(p, talla, color) {
    return `https://wa.me/${numeroWA}?text=${encodeURIComponent(mensajeWhatsApp(p, talla, color))}`;
  }

  window.Meow = { cfg, db, configurado, esc, precio, urlSegura, placeholder, enlaceWhatsApp, cargarWhatsApp };
})();
