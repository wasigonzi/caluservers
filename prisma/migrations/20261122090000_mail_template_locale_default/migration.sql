-- `schema.prisma` declara `MailTemplate.locale` con @default("es"), pero la
-- migración que creó la tabla no puso default. El panel siempre envía el
-- idioma, así que hoy no falla; esta migración elimina la deriva para que
-- `prisma migrate diff` quede limpio y una inserción que omita el idioma no
-- rompa.
ALTER TABLE "MailTemplate" ALTER COLUMN "locale" SET DEFAULT 'es';
