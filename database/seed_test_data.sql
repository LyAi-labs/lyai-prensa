-- ============================================================
-- Fixture de datos de prueba — SOLO para desarrollo/verificación
-- local (Postgres nativo del sandbox). NO ejecutar contra lyai_db
-- real: usa UUIDs literales y no pasa por el pipeline (ingest /
-- extract_claims / embed_claims / judge_contradictions), así que no
-- representa un estado alcanzable en producción por esos scripts.
--
-- Objetivo: probar el contrato de la API (GET /api/noticias) y del
-- frontend con datos donde cada contradicción SÍ tiene una pareja real
-- y localizable — justo lo que sampleNews.ts nunca garantizó.
--
-- Uso:
--   PGPASSWORD=lyai psql "postgres://lyai:lyai@localhost:5432/lyai_db" \
--     -f database/seed_test_data.sql
-- ============================================================

SET search_path TO prensa, public;

-- ---- Fuentes (subconjunto real de pipeline/fuentes.py) ----
INSERT INTO fuentes (id, slug, nombre, pais, idioma, rss_url, web_url, color, sesgo, activo) VALUES
    ('00000000-0000-0000-0000-0000000000f1', 'el-pais',    'El País',    'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', 'https://elpais.com', '#c8102e', 'centro_izq', true),
    ('00000000-0000-0000-0000-0000000000f2', 'el-mundo',   'El Mundo',   'ES', 'es', 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml', 'https://www.elmundo.es', '#0a3d62', 'centro_der', true),
    ('00000000-0000-0000-0000-0000000000f3', 'abc',        'ABC',        'ES', 'es', 'https://www.abc.es/rss/feeds/abc_ultima.xml', 'https://www.abc.es', '#e30613', 'derecha', true),
    ('00000000-0000-0000-0000-0000000000f4', 'eldiario-es','eldiario.es','ES', 'es', 'https://www.eldiario.es/rss/', 'https://www.eldiario.es', '#e85a4f', 'izquierda', true)
ON CONFLICT (id) DO NOTHING;

-- ---- Noticias (8) ----
-- n1/n2: el ejemplo textual de docs/contradiccion-criterios.md (SMI 5% vs 7%).
INSERT INTO noticias (id, fuente_id, id_externo, titular, descripcion, enlace, publicada_en) VALUES
    ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000f1', 'seed-n1', 'El Gobierno aprueba la subida del SMI al 5% para 2026', 'El Consejo de Ministros aprobó hoy la subida del salario mínimo interprofesional.', 'https://elpais.com/seed-n1', NOW() - INTERVAL '2 hours'),
    ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000f2', 'seed-n2', 'El Ejecutivo eleva el salario mínimo un 7% en 2026', 'Fuentes del ministerio confirman la cifra final tras las negociaciones con patronal y sindicatos.', 'https://elmundo.es/seed-n2', NOW() - INTERVAL '90 minutes'),
    ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-0000000000f3', 'seed-n3', 'El Constitucional avala el nuevo modelo de financiación autonómica', 'La decisión se tomó por mayoría en el pleno de esta mañana.', 'https://abc.es/seed-n3', NOW() - INTERVAL '5 hours'),
    ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-0000000000f4', 'seed-n4', 'La Fiscalía europea investiga contratos públicos en Aragón', 'La investigación se ha abierto tras una denuncia anónima.', 'https://eldiario.es/seed-n4', NOW() - INTERVAL '8 hours'),
    ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-0000000000f1', 'seed-n5', 'El paro baja al 10,2% en el tercer trimestre', 'El INE publica los datos de la EPA correspondientes al trimestre.', 'https://elpais.com/seed-n5', NOW() - INTERVAL '1 day'),
    ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-0000000000f2', 'seed-n6', 'Un informe alerta del repunte del paro juvenil', 'El estudio señala que el colectivo menor de 25 años no sigue la tendencia general.', 'https://elmundo.es/seed-n6', NOW() - INTERVAL '20 hours'),
    ('00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-0000000000f3', 'seed-n7', 'Récord de turistas extranjeros en lo que va de año', 'Las cifras superan las expectativas del sector.', 'https://abc.es/seed-n7', NOW() - INTERVAL '30 hours'),
    ('00000000-0000-0000-0000-00000000b008', '00000000-0000-0000-0000-0000000000f4', 'seed-n8', 'La inflación se modera hasta el 2,8% en agosto', 'El dato consolida la tendencia a la baja de los últimos meses.', 'https://eldiario.es/seed-n8', NOW() - INTERVAL '3 hours')
ON CONFLICT (id) DO NOTHING;

-- ---- Claims (2 por noticia; c1a es el que se compara para la contradicción) ----
INSERT INTO claims (id, noticia_id, sujeto, predicado, objeto, cita, tema, factual, confianza_extr, extractor) VALUES
    ('00000000-0000-0000-0000-00000000c1a1', '00000000-0000-0000-0000-00000000b001', 'El Gobierno', 'aprobó la subida del SMI al', '5% para 2026', 'El Consejo de Ministros aprobó hoy la subida del SMI al 5%', 'economía', true, 0.95, 'seed'),
    ('00000000-0000-0000-0000-00000000c1a2', '00000000-0000-0000-0000-00000000b001', 'La subida del SMI', 'se aplicará desde', 'febrero de 2026', 'se aplicará desde febrero', 'economía', true, 0.9, 'seed'),
    ('00000000-0000-0000-0000-00000000c2a1', '00000000-0000-0000-0000-00000000b002', 'El Gobierno', 'aprobó la subida del SMI al', '7% para 2026', 'el salario mínimo sube un 7%', 'economía', true, 0.95, 'seed'),
    ('00000000-0000-0000-0000-00000000c2a2', '00000000-0000-0000-0000-00000000b002', 'La subida del salario mínimo', 'se aplicará desde', 'enero de 2026', 'entrará en vigor en enero', 'economía', true, 0.85, 'seed'),
    ('00000000-0000-0000-0000-00000000c3a1', '00000000-0000-0000-0000-00000000b003', 'El Tribunal Constitucional', 'avaló', 'el nuevo modelo de financiación autonómica', NULL, 'cataluña', true, 0.9, 'seed'),
    ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-00000000b004', 'La Fiscalía europea', 'investiga', 'contratos públicos en Aragón', NULL, 'corrupción', true, 0.9, 'seed'),
    ('00000000-0000-0000-0000-00000000c5a1', '00000000-0000-0000-0000-00000000b005', 'El INE', 'situó la tasa de paro en', '10,2% en el tercer trimestre', NULL, 'empleo', true, 0.95, 'seed'),
    ('00000000-0000-0000-0000-00000000c6a1', '00000000-0000-0000-0000-00000000b006', 'El paro juvenil', 'repuntó', 'en el último trimestre', NULL, 'empleo', true, 0.8, 'seed'),
    ('00000000-0000-0000-0000-00000000c7a1', '00000000-0000-0000-0000-00000000b007', 'El sector turístico', 'registró un récord de', 'turistas extranjeros este año', NULL, 'turismo', true, 0.85, 'seed'),
    ('00000000-0000-0000-0000-00000000c8a1', '00000000-0000-0000-0000-00000000b008', 'El INE', 'situó la inflación interanual en', '2,8% en agosto', NULL, 'economía', true, 0.9, 'seed')
ON CONFLICT (id) DO NOTHING;

-- ---- Contradicción confirmada: c1a1 (SMI 5%) vs c2a1 (SMI 7%) ----
-- CHECK (claim_a_id < claim_b_id) exige el orden canónico; c1a1 < c2a1 en
-- orden lexicográfico de UUID, así que va tal cual.
INSERT INTO contradicciones (id, claim_a_id, claim_b_id, tema, intensidad, razonamiento, juez, revisado) VALUES
    ('00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-00000000c1a1', '00000000-0000-0000-0000-00000000c2a1',
     'economía', 0.9,
     'Cifras del SMI incompatibles sobre el mismo hecho: 5% (El País) vs 7% (El Mundo) para 2026. No es margen de redondeo — es contradicción directa.',
     'claude-sonnet-5', false)
ON CONFLICT (claim_a_id, claim_b_id) DO NOTHING;

-- Refleja en pares_evaluados TODOS los veredictos del juez, no solo el
-- positivo — así se ve que la tabla también registra descartes.
INSERT INTO pares_evaluados (claim_a_id, claim_b_id, label, intensidad, similitud_coseno, juez) VALUES
    ('00000000-0000-0000-0000-00000000c1a1', '00000000-0000-0000-0000-00000000c2a1', 'contradiccion', 0.9, 0.87, 'claude-sonnet-5'),
    ('00000000-0000-0000-0000-00000000c5a1', '00000000-0000-0000-0000-00000000c6a1', 'no_relacionado', 0, 0.71, 'claude-sonnet-5')
ON CONFLICT (claim_a_id, claim_b_id) DO NOTHING;

-- Precalculado que en producción escribiría judge_contradictions.py tras
-- cada corrida — el API lee estos campos ya resueltos, sin agregarlos
-- en cada request.
UPDATE noticias SET intensidad_contradiccion = 0.9, eje_z = 2.7
WHERE id IN ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002');
