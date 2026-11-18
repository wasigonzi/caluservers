# Respaldos — pg_dump + age + bucket (Fase 6, frente C)

## Decisiones del dueño (pendientes de confirmar)

- **Frecuencia recomendada: diaria.** El script es manual; el dueño
  decide si lo programa (cron del servidor o Vercel Cron contra una ruta
  que lo dispare) o lo corre a mano. Sin programarlo, no hay respaldo
  automático: no se finge que lo haya.
- **Retención recomendada: 30 días + 12 meses.** Se guardan los respaldos
  diarios 30 días y un respaldo mensual durante 12 meses. La purga de los
  viejos es manual hasta que el dueño decida automatizarla.
- **Restauración probada trimestral.** Cada trimestre se restaura un
  respaldo en una base de pruebas con `scripts/restore.mjs --dry-run` y
  luego con `--target-db` + `--confirm` contra esa base, nunca contra
  producción a ciegas. La primera prueba trimestral está pendiente.

## Qué respalda y qué no

`scripts/backup.mjs` hace `pg_dump` de `DATABASE_URL` (toda la base:
pedidos, clientes, servicios, tickets, plugins con sus secretos cifrados,
sesiones y auditoría). No respalda archivos subidos fuera de la base
(por ejemplo, adjuntos de tickets en `TICKET_ATTACHMENTS_DIR` o logos en
Vercel Blob): esos se respaldan aparte, donde vivan.

## Uso

```bash
# Respaldo local (sin bucket): queda en backups/, con aviso si va sin cifrar.
DATABASE_URL=... node scripts/backup.mjs

# Con cifrado age (recomendado): genera la clave y pon la pública en Vercel.
#   age-keygen -o age-identity.txt   # la pública va en BACKUP_AGE_PUBLIC_KEY
BACKUP_AGE_PUBLIC_KEY="age1..." DATABASE_URL=... node scripts/backup.mjs

# Con subida al bucket S3-compatible (las 4 variables o ninguna).
BACKUP_S3_ENDPOINT="https://s3.us-east-1.amazonaws.com" \
BACKUP_S3_BUCKET="caluservers-respaldos" \
BACKUP_S3_ACCESS_KEY="..." BACKUP_S3_SECRET_KEY="..." \
BACKUP_AGE_PUBLIC_KEY="age1..." DATABASE_URL=... node scripts/backup.mjs
```

- El archivo se llama `caluservers-YYYYMMDD-HHMMSS.sql` (o `.sql.age` si
  se cifró). Si `age` no está instalado o no hay clave pública, el
  respaldo queda **sin cifrar** y el script lo dice claro: nunca se finge
  cifrado.
- Sin las 4 variables del bucket, el respaldo queda solo en local y el
  script lo dice: **nunca se sube nada sin credenciales**.
- Sin `DATABASE_URL` o sin `pg_dump` instalado, el script sale con error
  y no crea nada. Un `pg_dump` fallido no deja archivo parcial.

## Restauración

```bash
# Solo verificar, sin tocar ninguna base (modo por defecto).
node scripts/restore.mjs backups/caluservers-20261118-090000.sql.age

# Restaurar a una base de pruebas: exige --confirm explícito.
node scripts/restore.mjs backups/caluservers-20261118-090000.sql.age \
  --target-db "postgresql://user:password@host:5432/caluservers_pruebas" --confirm
```

- Un respaldo `.age` necesita `age` instalado y `BACKUP_AGE_PRIVATE_KEY`
  (la clave `AGE-SECRET-KEY-...` en texto o la ruta al archivo de
  identidad). La clave privada nunca se imprime ni se guarda en el repo.
- El `--dry-run` comprueba que el archivo existe, descifra si hace falta
  y valida que el SQL parece un `pg_dump` válido (cabecera
  «PostgreSQL database dump»).
- Restaurar **sobrescribe** los datos de la base destino: se usa contra
  una base vacía o de pruebas. Contra producción, solo con el dueño
  delante y el respaldo verificado antes.
- La clave privada de age y las credenciales del bucket viven solo en
  variables de entorno (Vercel o el equipo que corre el respaldo), nunca
  en el repo. Ver `.env.example`.

## Variables

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Base a respaldar (obligatoria para `backup.mjs`) |
| `BACKUP_AGE_PUBLIC_KEY` | Clave pública age (`age1...`) para cifrar |
| `BACKUP_AGE_PRIVATE_KEY` | Clave privada age o ruta al archivo de identidad, para restaurar |
| `BACKUP_S3_ENDPOINT` | Endpoint S3-compatible (p. ej. `https://s3.us-east-1.amazonaws.com`) |
| `BACKUP_S3_BUCKET` | Nombre del bucket |
| `BACKUP_S3_ACCESS_KEY` | Clave de acceso del bucket |
| `BACKUP_S3_SECRET_KEY` | Clave secreta del bucket |
| `BACKUP_S3_REGION` | Región para la firma SigV4 (por defecto `us-east-1`) |
