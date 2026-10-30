#!/usr/bin/env bash
#
# Deja el Postgres dedicado de prensa (`lyai_prensa_postgres`) con sus roles,
# extensiones y permisos. IDEMPOTENTE: se puede relanzar siempre — tras
# restaurar un backup, tras rotar una password en .env, en un servidor nuevo.
#
#   ops/prensa-db-bootstrap.sh            # base `prensa`
#   ops/prensa-db-bootstrap.sh OTRA_BD    # misma receta sobre otra base (ensayos de restore)
#
# Roles:
#   postgres    superusuario. Solo administración y backups, por `docker exec`
#               (socket local del contenedor). No está en ninguna URL de la app.
#   prensa      DUEÑO de la base y del esquema `prensa`. Lo usa el pipeline
#               (host, cron). No es superusuario.
#   prensa_api  SOLO LECTURA. Lo usa el contenedor `api`, que es lo expuesto a
#               internet: aunque le cuelen una consulta, no puede escribir.
#
# Las passwords no se escriben aquí ni viajan por argv: se leen de .env y pasan
# al contenedor por entorno.
#   prensa      -> la de DATABASE_URL
#   prensa_api  -> PRENSA_API_DB_PASSWORD
#
# Rotar una password: cambiarla en .env, relanzar este script y recrear `api`
# (`docker-compose up -d --no-deps --force-recreate api`; un `restart` no relee .env).

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PRENSA_ENV_FILE:-$DIR/.env}"
CONTAINER="${PRENSA_PG_CONTAINER:-lyai_prensa_postgres}"
DB="${1:-prensa}"

[[ "$DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "[FAIL] nombre de base no válido: $DB" >&2; exit 2; }
[ -r "$ENV_FILE" ] || { echo "[FAIL] no puedo leer $ENV_FILE" >&2; exit 1; }

PRENSA_OWNER_PW="$(python3 - "$ENV_FILE" <<'PY'
import sys, urllib.parse as u
for line in open(sys.argv[1]):
    if line.startswith("DATABASE_URL="):
        p = u.urlsplit(line.split("=", 1)[1].strip())
        if p.username != "prensa":
            sys.exit(f"DATABASE_URL usa el rol {p.username!r}; se esperaba 'prensa'")
        print(u.unquote(p.password or ""), end="")
        break
PY
)"
PRENSA_API_PW="$(grep -E '^PRENSA_API_DB_PASSWORD=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$PRENSA_OWNER_PW" ] || { echo "[FAIL] DATABASE_URL sin password en $ENV_FILE" >&2; exit 1; }
[ -n "$PRENSA_API_PW" ]   || { echo "[FAIL] falta PRENSA_API_DB_PASSWORD en $ENV_FILE" >&2; exit 1; }
export PRENSA_OWNER_PW PRENSA_API_PW

psql_admin() {
  docker exec -i -e PRENSA_OWNER_PW -e PRENSA_API_PW "$CONTAINER" \
    psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

# 1) Roles (nivel de clúster) y base.
psql_admin -d postgres -v db="$DB" <<'SQL'
\getenv owner_pw PRENSA_OWNER_PW
\getenv api_pw PRENSA_API_PW
SELECT 'CREATE ROLE prensa'     WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prensa')     \gexec
SELECT 'CREATE ROLE prensa_api' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prensa_api') \gexec
ALTER ROLE prensa     LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'owner_pw';
ALTER ROLE prensa_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'api_pw';
ALTER ROLE prensa_api SET default_transaction_read_only = on;
SELECT format('CREATE DATABASE %I OWNER prensa', :'db')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SELECT format('ALTER DATABASE %I OWNER TO prensa', :'db') \gexec
SELECT format('ALTER DATABASE %I SET search_path = prensa, public', :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO prensa_api', :'db') \gexec
SQL

# 2) Dentro de la base: extensiones y permisos.
psql_admin -d "$DB" <<'SQL'
-- pgvector no es una extensión "trusted": solo la crea un superusuario.
CREATE EXTENSION IF NOT EXISTS vector      WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- Lo que el rol `prensa` cree de aquí en adelante, `prensa_api` lo puede leer.
ALTER DEFAULT PRIVILEGES FOR ROLE prensa GRANT SELECT ON TABLES TO prensa_api;

-- Si el esquema ya existe (p. ej. tras un restore), alinear dueño y permisos de lo que haya.
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'prensa') THEN
    ALTER SCHEMA prensa OWNER TO prensa;
    FOR r IN SELECT c.oid::regclass AS obj
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'prensa' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') LOOP
      EXECUTE format('ALTER TABLE %s OWNER TO prensa', r.obj);
    END LOOP;
    FOR r IN SELECT p.oid::regprocedure AS obj
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'prensa' LOOP
      EXECUTE format('ALTER ROUTINE %s OWNER TO prensa', r.obj);
    END LOOP;
    GRANT USAGE ON SCHEMA prensa TO prensa_api;
    GRANT SELECT ON ALL TABLES IN SCHEMA prensa TO prensa_api;
  END IF;
END $$;
SQL

echo "[OK] $CONTAINER/$DB: roles prensa (dueño) y prensa_api (solo lectura) alineados con $(basename "$ENV_FILE")"
docker exec "$CONTAINER" psql -U postgres -d "$DB" -X -At -c \
  "select '     extensiones: ' || string_agg(e.extname || ' ' || e.extversion || ' (' || n.nspname || ')', ', ' order by e.extname)
     from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql'"
