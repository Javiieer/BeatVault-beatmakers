# Carga de medios local

Actualizado: 2026-10-26. Los formatos de entrada y los formatos almacenados/entregados
son contratos separados. Los stems siguen fuera del alcance.

## Audio

- WAV, MP3, FLAC, AAC, M4A, OGG y WEBM; hasta 500 MiB por archivo con la configuración
  local predeterminada. No se anunció AIFF/otros códecs sin su cadena de entrega completa.
- Hasta 50 archivos por lote en la interfaz. Selección múltiple, selección adicional,
  arrastrar y soltar, acceso de teclado y detección de archivos repetidos en la cola.
- Cada archivo puede recibir su propio nombre; el tipo, tags y portada se comparten
  por lote. La interfaz informa si está subiendo audio, procesando portada o guardando
  la ficha. Un fallo parcial conserva los archivos ya subidos para reintentar.
- Un MIME vacío/genérico de Windows puede resolverse por extensión. El servidor
  mantiene su allowlist, comprueba firma y utiliza FFmpeg para el preview. No basta
  con renombrar un archivo ni enviar una extensión conocida.
- El original de audio permanece privado e intacto; el preview procesado es separado.
  FFmpeg de previews limita protocolos a archivos locales y elimina metadata del preview.
  Los formatos comprados continúan siendo MP3/WAV.
- El borrador del navegador conserva metadata, no una copia de los archivos. Después
  de recargar es necesario volver a seleccionarlos; el catálogo confirmado vive en el servidor.

## Imágenes

| Uso | Entrada permitida | Límite de entrada | Transformación |
| --- | --- | --- | --- |
| Portada de audio | JPG, PNG, WebP, AVIF estáticos | 10 MiB; ambos lados al menos 640 px, hasta 10 000 px por lado | Orientación aplicada; recorte centrado cuadrado hasta 4000 px; JPEG o PNG normalizado |
| Avatar/portada de perfil | Los mismos cuatro formatos | 8 MiB; ambos lados al menos 256 px, hasta 8000 px por lado | Proporción conservada, orientación aplicada; el encuadre del perfil sigue siendo ajustable |
| Fotos de posts/historias | Los mismos cuatro formatos | 20 MiB; ambos lados al menos 256 px, hasta 8000 px por lado | Proporción conservada y JPEG/PNG normalizado |

Todas las imágenes comparten el tope de 16 megapíxeles, 64 MiB de píxeles decodificados
y 15 segundos por operación Sharp. Los límites de cuota y concurrencia de los endpoints
siguen vigentes y contabilizan los bytes almacenados, junto con las miniaturas correspondientes.
El perfil conserva además el tope conjunto previo de 15 MiB para avatar/portada y miniaturas.

El servidor detecta firmas, contrasta el MIME declarado, comprueba el códec AV1 de AVIF,
decodifica por completo y rechaza animaciones, SVG, truncamientos e imágenes fuera de límites.
No guarda EXIF/XMP/IPTC del archivo de entrada. PNG y transparencia se mantienen en PNG;
los otros formatos sin transparencia se normalizan a JPEG. La fuente visual almacenada
es una imagen normalizada, no una copia byte a byte del archivo original de la cámara.
El usuario debe conservar su archivo fuente si necesita recuperarlo con sus metadatos originales.

La portada de audio usa recorte centrado explícito y su vista previa muestra ese encuadre.
No ofrece todavía un editor de posición específico para cada portada de audio. Los perfiles
sí conservan su editor de encuadre. Los videos siguen con su contrato MP4 existente;
este cambio no amplía sus códecs ni incorpora nuevos formatos de video.

## Verificación

`server/image-upload.test.ts` genera y decodifica JPEG/PNG/WebP/AVIF reales; verifica
orientación, proporciones, transparencia, metadata, falsificación MIME, truncamiento,
animación y límites. Las pruebas API verifican imágenes servidas limpias y cuotas
basadas en tamaño normalizado. Las pruebas de componentes verifican cola incremental,
drop, nombres por archivo y portada rectangular. `tests/media-upload-formats.spec.ts`
añade recorridos de escritorio WebP y móvil AVIF con descarga de WAV byte a byte.
