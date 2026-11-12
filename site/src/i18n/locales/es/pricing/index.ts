export default {
  "timeBasedNote": "Las tarifas por horario corresponden al momento de la captura; el precio real depende de la hora de la solicitud y de la factura de OKINTO.",
  "eyebrow": "PRECIOS · PAGO POR USO",
  "h2mark": "Sin suscripción",
  "h2rest": ". Paga solo por lo que usas.",
  "lead": "okbot es gratis y de código abierto: sin suscripción ni niveles. OKINTO cobra el uso de los modelos por token, y la lista de precios es totalmente pública.",
  "source": "Precios tomados de api.okinto.com/pricing el {fetchedAt} (UTC+8), versión {pricingVersion}.",
  "stale": "Precios del {snapshotDate} (no se pudieron actualizar; api.okinto.com/pricing es la referencia oficial).",
  "cards": {
    "app": {
      "tag": "okbot",
      "price": "$0",
      "unit": "/ para siempre",
      "note": "Gratis y de código abierto (MIT)",
      "points": [
        "Escritorio, Docker y CLI: todo gratis",
        "Sin suscripción ni niveles de plan",
        "Crea todos los bots que quieras, cada uno definido por ti"
      ]
    },
    "usage": {
      "tag": "Uso de modelos · lo cobra OKINTO",
      "unit": "/ 1M de tokens de entrada",
      "note": "Ejemplo: {model} ? grupo predeterminado ? salida {output} por 1M de tokens.",
      "points": [
        "Cobro por token, entrada y salida por separado",
        "Consulta los precios públicos",
        "Cambia de modelo cuando quieras"
      ],
      "cta": "Ver la lista de precios completa ↗"
    },
    "month": {
      "tag": "Uso mensual estimado",
      "unit": "/ mes",
      "note": "Ejemplo: 50 mensajes al día, cada uno con 3000 tokens de entrada + 600 de salida, {model}.",
      "points": [
        "Calcula tu propio uso con la calculadora de abajo",
        "La estimación no incluye descuentos por caché ni multiplicadores de solicitudes especiales",
        "La factura de OKINTO es la referencia oficial"
      ],
      "cta": "Abrir la calculadora"
    }
  },
  "contrast": {
    "caption": "Pago por uso frente a niveles de suscripción",
    "head": [
      "",
      "Pago por uso (okbot + OKINTO)",
      "Niveles de suscripción (lo habitual)"
    ],
    "rows": [
      [
        "Cómo se cobra",
        "Pagas lo que usas, sin suscripción",
        "Pagas una suscripción; el nivel determina cuánto puedes usar"
      ],
      [
        "Lo que no usas",
        "Sin gasto fijo",
        "La cuota del mes normalmente no se acumula"
      ],
      [
        "Cambiar de modelo",
        "Cuando quieras; el precio depende del modelo",
        "Los modelos disponibles suelen depender del nivel"
      ],
      [
        "Cómo se expresan los precios",
        "Tarifas por 1M de tokens, publicadas",
        "A menudo como múltiplos relativos de una cuota"
      ]
    ],
    "note": "“Niveles de suscripción” describe el enfoque habitual de los productos de pago por suscripción, no un producto concreto ni sus precios reales."
  },
  "table": {
    "more": "Ver los precios de los {textCount} modelos de texto →",
    "caption": "Precios de los modelos de texto en OKINTO (ruta predeterminada, USD por 1M de tokens)",
    "col": {
      "model": "Modelo",
      "route": "Ruta predeterminada",
      "input": "Entrada / 1M",
      "output": "Salida / 1M",
      "official": "Oficial (entrada / salida)",
      "vs": "vs. oficial"
    },
    "default": "Predeterminada",
    "context": "Contexto de {n}",
    "showAll": "Ver los {textCount} modelos de texto",
    "showFeatured": "Solo destacados",
    "search": "Buscar modelos",
    "allVendors": "Todos los proveedores",
    "media": "Los modelos de imagen y video ({mediaCount}) están en api.okinto.com/pricing ↗",
    "expand": "Ver todas las rutas de {model}",
    "detail": {
      "route": "Ruta",
      "positioning": "Posicionamiento",
      "vs": "vs. oficial",
      "price": "Entrada / salida"
    },
    "positioning": {
      "stable": "Ruta de alta estabilidad",
      "award": "Ruta con prioridad de precio",
      "campaign": "Ruta por tiempo limitado",
      "enterprise": "Ruta de alta estabilidad (solo para producción empresarial autorizada)",
      "other": "Otra ruta"
    },
    "unlock": "Se desbloquea con una sola recarga de US${amount} (por tiempo limitado; se aplican las reglas de OKINTO)",
    "tiers": "Las solicitudes individuales de más de {n} tokens usan el nivel de contexto largo: entrada {input} · salida {output}",
    "none": "No hay modelos que coincidan.",
    "note": "Precios en USD por 1M de tokens para la ruta predeterminada; tu cuenta puede tener otro acceso o descuentos (como indica la página de OKINTO). Datos de api.okinto.com/pricing, tomados el {fetchedAt} (UTC+8), versión {pricingVersion}."
  },
  "calc": {
    "title": "Estima tu costo mensual",
    "model": "Modelo",
    "search": "Escribe para buscar modelos",
    "none": "No hay modelos que coincidan.",
    "route": "Ruta",
    "routeDefault": "Ruta predeterminada",
    "routeAward": "Prioridad de precio (award)",
    "routeAwardNote": "adecuada para desarrollo y pruebas que se pueden reintentar",
    "msgs": "Mensajes al día",
    "inTok": "Tokens de entrada por mensaje",
    "inTokNote": "Incluye el historial del chat y los resultados de herramientas",
    "outTok": "Tokens de salida por mensaje",
    "days": "Estimación para 30 días",
    "presets": {
      "light": "Ligero",
      "everyday": "Habitual",
      "heavy": "Intensivo (agente)"
    },
    "hint": "Un mensaje = todas las llamadas al modelo detrás de una respuesta del bot; una tarea de agente puede implicar varias llamadas.",
    "result": "≈ {amount} / mes",
    "split": "entrada {input} · salida {output}",
    "perMsg": "unos {amount} por mensaje",
    "official": "unos {amount} a precios oficiales",
    "disclaimer": "Solo es una estimación. No incluye descuentos por caché ni multiplicadores por solicitud (p. ej., el nivel de servicio prioritario); las solicitudes que superan el umbral de nivel de un modelo se cobran al nivel superior (ya incluido); la factura de OKINTO es la referencia oficial.",
    "copy": "Copiar estimación",
    "copyText": "Estimación de uso de okbot: {model} ({route}), {msgs} mensajes al día, {inTok} tokens de entrada + {outTok} de salida cada uno: unos {amount} al mes (30 días, precios del {fetchedAt})",
    "full": "Ver todos los precios de este modelo ↗",
    "expandBar": "Detalles"
  },
  "banner": {
    "text": "¿Ya tienes una cuenta de OKINTO? Inicia sesión una vez en la app y listo: el uso se cobra según la lista de precios.",
    "cta": "Abrir OKINTO ↗"
  },
  "pageTitle": "Precios de okbot: pago por uso, lista de precios pública",
  "pageDescription": "okbot es gratis y de código abierto, sin suscripción. OKINTO cobra el uso de los modelos por token: lista de precios pública y calculadora de costo mensual."
};
