# Política de backups y HA — `lyai_db`

Operación canónica de la base de datos compartida `lyai_db`
(contenedor Docker `lyai_postgres`) que aloja los esquemas
`lyai`, `puertas`, `autonoma` y `prensa`.

> Los artefactos de este documento (`ops/postgres-backup.sh`, etc.)
> viven aquí provisionalmente. Cuando exista un repo de operaciones
> compartido (p.ej. `lyai-ops`) deberían moverse allí; lo importante
> es que la política y los scripts se mantengan **fuera** del repo
> de cualquier vertical concreta.

## Riesgos cubiertos

| Riesgo                                          | Mitigación                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `docker compose down -v` accidental             | Volumen externo + `Makefile` que oculta el comando peligroso        |
| Corrupción silenciosa del volumen               | Restore-test semanal sobre una DB efímera                           |
| Pérdida del host completo                       | Off-site sync de los dumps cifrados a almacenamiento externo        |
| Borrado lógico (DROP TABLE, UPDATE sin WHERE)   | Retención GFS 7 diarios + 12 semanales + 12 mensuales               |
| Hardware corruption del disco                   | Regla 3-2-1 (3 copias, 2 medios, 1 off-site)                        |
| Caída del Postgres en horario laboral           | Tier 2 (replica streaming) cuando el dolor lo justifique            |

## Política de backups (Tier 1 — desde el día 1)

### Qué

1. **Dump completo** (`pg_dumpall`) — captura usuarios, roles y todos los esquemas.
2. **Dump por esquema** (`pg_dump --schema=...`) — facilita restore selectivo de una vertical sin tocar las demás.

Formato: `pg_dump -Fc` (custom, comprimido). Más compacto y restaurable selectivamente con `pg_restore`. Para `pg_dumpall` usamos texto comprimido con `gzip -9`.

### Cuándo

| Tipo                | Frecuencia      | Hora                       |
| ------------------- | --------------- | -------------------------- |
| Dump por esquema    | Cada 6 horas    | 00:00, 06:00, 12:00, 18:00 |
| Dump completo       | Diario          | 03:00                      |
| Sync off-site       | Inmediato (post-dump) | dentro del propio script |
| Limpieza retención  | Diario          | 04:30                      |
| Restore-test        | Semanal         | Domingo 05:00              |

### Dónde

- **Local primario**: `/var/backups/lyai_db/` (volumen separado del de Postgres, idealmente en otro disco físico).
- **Off-site secundario**: bucket S3-compatible (Hetzner Object Storage / MinIO propio / similar). Cifrado con `age` antes de subir.

### Retención

| Backup             | Retención    |
| ------------------ | ------------ |
| Por esquema (6 h)  | 7 días       |
| Diario completo    | 30 días      |
| Semanal (domingo)  | 12 semanas   |
| Mensual (día 1)    | 12 meses     |

Implementada con `find … -mtime +N -delete` por capa.

### Cifrado

Off-site con `age`. La clave pública (`AGE_RECIPIENT`) vive en `/etc/lyai/backup.env`; la clave privada **solo** en el password manager de la organización y en el host de restore. Nunca subir dumps en claro.

## Procedimiento de restore

### A. Restore total (host nuevo / desastre)

```bash
docker compose up -d postgres
docker exec lyai_postgres pg_isready -U postgres -t 30

# Si el dump está off-site, descargarlo y descifrar primero:
aws s3 cp "$S3_BUCKET/diario-YYYY-MM-DD.sql.gz.age" .
age -d -i ~/.age/lyai.key -o diario-YYYY-MM-DD.sql.gz \
  diario-YYYY-MM-DD.sql.gz.age

gunzip -c diario-YYYY-MM-DD.sql.gz \
  | docker exec -i lyai_postgres psql -U postgres
```

### B. Restore selectivo (una vertical estropeada)

```bash
# 1. (Opcional) crear snapshot manual antes
./ops/postgres-backup.sh schema prensa

# 2. Drop del esquema afectado
docker exec -i lyai_postgres psql -U postgres -d lyai_db \
  -c "DROP SCHEMA prensa CASCADE;"

# 3. Restore desde el .dump por esquema
docker exec -i lyai_postgres pg_restore -U postgres -d lyai_db \
  < /var/backups/lyai_db/prensa-YYYY-MM-DDTHH.dump
```

### C. Restore point-in-time

Tier 1 **no** lo cubre. Para PITR hay que activar `archive_mode` y archivado de WAL → ver Tier 2.

## Política de HA — roadmap por tiers

### Tier 1 (ahora) — backups y procedimiento

- Volumen externo del compose, backups locales + off-site, restore probado, runbook escrito.
- **RPO**: hasta 6 h. **RTO**: ~1 h manual.

### Tier 2 (cuando los SLAs lo justifiquen)

- Réplica streaming en otro host (otra VPS / otra región).
- Modo asíncrono al inicio (`max_wal_senders=5`, `wal_level=replica`).
- Failover **manual** documentado: promoción de la replica + cambio de DNS / connection string.
- WAL archiving activado para PITR.
- **RPO**: < 1 minuto. **RTO**: 5–15 min manuales.

### Tier 3 (tráfico real, on-call 24/7)

- Patroni + etcd + HAProxy → failover automático.
- Múltiples replicas, lectura distribuida.
- Backups continuos a object storage (`pgbackrest` o `WAL-G`).
- Pruebas de failover programadas.
- **RPO**: < 1 s. **RTO**: < 1 min automático.

## Cambios operacionales inmediatos

### 1. Volumen externo

En el `docker-compose.yml` del host:

```yaml
volumes:
  lyai_db_data:
    external: true
    name: lyai_db_data

services:
  postgres:
    image: pgvector/pgvector:pg15
    container_name: lyai_postgres
    volumes:
      - lyai_db_data:/var/lib/postgresql/data
    # ...
```

Crear el volumen una vez:

```bash
docker volume create lyai_db_data
```

Si hay datos en el volumen anterior, migrarlos antes:

```bash
docker run --rm \
  -v <volumen_actual>:/from \
  -v lyai_db_data:/to \
  alpine sh -c 'cd /from && cp -av . /to'
```

Tras esto, `docker compose down -v` ya **no** borra los datos.

### 2. Makefile defensivo

Añadir al repo de operaciones (o `lyai-core`):

```makefile
.PHONY: db-up db-down db-restart db-shell db-logs

db-up:
	docker compose up -d postgres

db-down:
	@echo "[INFO] Bajo Postgres preservando volumen"
	docker compose down

db-restart:
	docker compose restart postgres

db-shell:
	docker exec -it lyai_postgres psql -U postgres -d lyai_db

db-logs:
	docker compose logs -f postgres

# 'down -v' NO se expone como target. Si alguien necesita
# borrar el volumen, debe escribirlo explícitamente y se queda
# como decisión consciente (no atajo del Makefile).
```

### 3. Cron de backups

```bash
sudo install -m 0644 ops/crontab.example /etc/cron.d/lyai-postgres-backups
sudo systemctl reload cron     # o 'service cron reload'
```

### 4. Variables de entorno

Crear `/etc/lyai/backup.env` (modo `0600`, owner `root`):

```bash
CONTAINER=lyai_postgres
PG_USER=postgres
PG_DB=lyai_db
BACKUP_DIR=/var/backups/lyai_db
AGE_RECIPIENT=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET=s3://lyai-backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=eu-central-1
```

### 5. Verificación

Cada lunes el e-mail / Slack del equipo recibe el resultado del restore-test del domingo. Si falla → alerta.

## Checklist de adopción

- [ ] Migrar volumen actual a `lyai_db_data` externo.
- [ ] Instalar scripts en `/opt/lyai/ops/` con permisos `+x`.
- [ ] Crear `/etc/lyai/backup.env` con valores reales (modo `0600`).
- [ ] Provisionar bucket off-site + clave `age` (privada en el password manager).
- [ ] Instalar cron desde `ops/crontab.example`.
- [ ] Probar restore manualmente al menos una vez.
- [ ] Programar revisión trimestral de la política.

## Apéndice — comandos útiles

| Acción                               | Comando                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| Listar dumps por esquema             | `ls -lh /var/backups/lyai_db/*.dump`                                 |
| Tamaño total ocupado                 | `du -sh /var/backups/lyai_db/`                                       |
| Verificar último dump (sin restore)  | `pg_restore -l /var/backups/lyai_db/prensa-YYYY-MM-DDTHH.dump`       |
| Bajada de Postgres SIN tocar volumen | `make db-down` (alias de `docker compose down`)                      |
| Logs en vivo                         | `docker compose logs -f postgres`                                    |
