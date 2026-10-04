-- Añade la URL de la foto de portada de cada noticia, cuando el feed RSS la
-- publica (media_content/media_thumbnail/enclosures — ver pipeline/ingest.py).
--
-- Decisión deliberada: se guarda la URL remota tal cual, SIN pasar por la
-- tabla `imagenes` (pensada para cachear localmente con sha1/path_local).
-- Cachear en disco es más correcto (evita hotlinking, controla el peso) pero
-- añade una superficie operativa nueva (storage, servir estático, limpieza)
-- que no está justificada todavía para una foto opcional de una card — se
-- puede migrar a `imagenes` más adelante si el hotlinking da problemas.
ALTER TABLE prensa.noticias ADD COLUMN IF NOT EXISTS imagen_url TEXT;
