-- ============================================================
-- 054_contact_email_unico — um e-mail = um contato, por conta
--
-- Até aqui só o TELEFONE era único (022). O e-mail tinha índice comum, então
-- dois pedidos simultâneos com o mesmo e-mail (n8n mandando a lista em
-- paralelo, dois fluxos no mesmo minuto) passavam pela checagem do app e
-- criavam o contato duas vezes.
--
-- Em ordem:
--   1. limpa e-mails que não identificam ninguém: vazio e o marcador do
--      Apollo para e-mail não liberado (`email_not_unlocked@domain.com`), que
--      juntaria pessoas diferentes;
--   2. junta os contatos que já repetem e-mail na mesma conta no mais antigo,
--      levando junto tudo o que aponta para eles (conversas, negócios, notas,
--      tags, tarefas, cadências...). Campos vazios do sobrevivente são
--      completados pelos outros, e uma nota no contato registra quem foi
--      juntado (nome, telefone, cargo) — nada some calado;
--   3. cria o índice ÚNICO (account_id, lower(email)).
--
-- Idempotente.
-- ============================================================

-- 1) E-mails que não identificam ninguém.
UPDATE contacts SET email = NULL
  WHERE btrim(email) = '' OR lower(email) LIKE 'email\_not\_unlocked@%';

-- 2) Junta os repetidos (re-executável).
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts_by_email()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group     RECORD;
  v_fk        RECORD;
  v_survivor  UUID;
  v_losers    UUID[];
  v_primarios UUID[];
  v_fill      RECORD;
  v_nota      TEXT;
  v_merged    INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           lower(email) AS email_key,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY account_id, lower(email)
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    -- O que os juntados têm e o sobrevivente não (o mais antigo vence).
    SELECT
      (array_agg(name         ORDER BY created_at) FILTER (WHERE btrim(coalesce(name, '')) <> ''))[1]         AS name,
      (array_agg(phone        ORDER BY created_at) FILTER (WHERE btrim(coalesce(phone, '')) <> ''))[1]        AS phone,
      (array_agg(job_title    ORDER BY created_at) FILTER (WHERE btrim(coalesce(job_title, '')) <> ''))[1]    AS job_title,
      (array_agg(linkedin_url ORDER BY created_at) FILTER (WHERE btrim(coalesce(linkedin_url, '')) <> ''))[1] AS linkedin_url,
      (array_agg(company      ORDER BY created_at) FILTER (WHERE btrim(coalesce(company, '')) <> ''))[1]      AS company,
      (array_agg(company_id   ORDER BY created_at) FILTER (WHERE company_id IS NOT NULL))[1]                  AS company_id,
      min(email_unsubscribed_at) AS email_unsubscribed_at,
      min(email_bounced_at)      AS email_bounced_at,
      string_agg(
        concat_ws(' · ', coalesce(nullif(btrim(name), ''), '(sem nome)'),
                  nullif(btrim(phone), ''), nullif(btrim(job_title), '')),
        E'\n' ORDER BY created_at)  AS resumo
    INTO v_fill
    FROM contacts WHERE id = ANY(v_losers);

    v_nota := 'Contatos com o mesmo e-mail juntados neste cadastro:' || E'\n' || v_fill.resumo;
    INSERT INTO contact_notes (contact_id, user_id, account_id, note_text)
      SELECT id, user_id, account_id, v_nota FROM contacts WHERE id = v_survivor;

    -- Tabelas com unicidade por contato: move o que não colide, descarta o resto.
    UPDATE contact_tags ct SET contact_id = v_survivor
      WHERE ct.contact_id = ANY(v_losers)
        AND NOT EXISTS (SELECT 1 FROM contact_tags s WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id);
    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

    UPDATE contact_custom_values cv SET contact_id = v_survivor
      WHERE cv.contact_id = ANY(v_losers)
        AND NOT EXISTS (SELECT 1 FROM contact_custom_values s
                        WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id);
    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

    -- deal_contacts: UNIQUE (deal_id, contact_id) e um só principal por negócio.
    -- Onde o sobrevivente já está no negócio, a linha do juntado sai; se ela era
    -- a principal, o sobrevivente vira o principal.
    WITH saiu AS (
      DELETE FROM deal_contacts l
        WHERE l.contact_id = ANY(v_losers)
          AND EXISTS (SELECT 1 FROM deal_contacts s WHERE s.deal_id = l.deal_id AND s.contact_id = v_survivor)
        RETURNING l.deal_id, l.is_primary
    )
    SELECT coalesce(array_agg(deal_id) FILTER (WHERE is_primary), '{}') INTO v_primarios FROM saiu;
    UPDATE deal_contacts SET is_primary = TRUE
      WHERE contact_id = v_survivor AND deal_id = ANY(v_primarios);
    -- dois juntados no mesmo negócio: fica um (o principal, se houver)
    DELETE FROM deal_contacts l
      WHERE l.contact_id = ANY(v_losers)
        AND EXISTS (SELECT 1 FROM deal_contacts o
                    WHERE o.deal_id = l.deal_id AND o.contact_id = ANY(v_losers) AND o.id <> l.id
                      AND (o.is_primary, o.id) > (l.is_primary, l.id));
    UPDATE deal_contacts SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

    -- Inscrições: UNIQUE NULLS NOT DISTINCT (cadence_id, deal_id, contact_id).
    UPDATE email_cadence_enrollments e SET contact_id = v_survivor
      WHERE e.contact_id = ANY(v_losers)
        AND NOT EXISTS (SELECT 1 FROM email_cadence_enrollments s
                        WHERE s.contact_id = v_survivor AND s.cadence_id = e.cadence_id
                          AND s.deal_id IS NOT DISTINCT FROM e.deal_id)
        AND e.id = (SELECT min(o.id::text)::uuid FROM email_cadence_enrollments o
                    WHERE o.contact_id = ANY(v_losers) AND o.cadence_id = e.cadence_id
                      AND o.deal_id IS NOT DISTINCT FROM e.deal_id);
    DELETE FROM email_cadence_enrollments WHERE contact_id = ANY(v_losers);

    -- flow_runs: um run ATIVO por contato. Só os inativos mudam; o ativo do
    -- juntado fica com contact_id NULL pelo ON DELETE SET NULL.
    UPDATE flow_runs SET contact_id = v_survivor
      WHERE contact_id = ANY(v_losers) AND status <> 'active';

    -- Todo o resto que aponta para contacts(id) muda sem colidir.
    FOR v_fk IN
      SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.contacts'::regclass
        AND array_length(c.conkey, 1) = 1
        AND c.conrelid NOT IN ('public.contact_tags'::regclass, 'public.contact_custom_values'::regclass,
                               'public.deal_contacts'::regclass, 'public.email_cadence_enrollments'::regclass,
                               'public.flow_runs'::regclass)
    LOOP
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = ANY($2)', v_fk.tabela, v_fk.coluna, v_fk.coluna)
        USING v_survivor, v_losers;
    END LOOP;

    DELETE FROM contacts WHERE id = ANY(v_losers);

    -- Completa o sobrevivente (depois do DELETE: o telefone era do juntado e
    -- o índice único de telefone não deixaria antes).
    UPDATE contacts c SET
      name         = CASE WHEN btrim(coalesce(c.name, '')) = ''         THEN v_fill.name         ELSE c.name END,
      phone        = CASE WHEN btrim(coalesce(c.phone, '')) = ''        THEN coalesce(v_fill.phone, c.phone) ELSE c.phone END,
      job_title    = CASE WHEN btrim(coalesce(c.job_title, '')) = ''    THEN v_fill.job_title    ELSE c.job_title END,
      linkedin_url = CASE WHEN btrim(coalesce(c.linkedin_url, '')) = '' THEN v_fill.linkedin_url ELSE c.linkedin_url END,
      company_id   = coalesce(c.company_id, v_fill.company_id),
      company      = CASE WHEN c.company_id IS NULL AND btrim(coalesce(c.company, '')) = '' THEN v_fill.company ELSE c.company END,
      -- quem pediu para sair continua fora, venha de qual cadastro vier
      email_unsubscribed_at = least(c.email_unsubscribed_at, v_fill.email_unsubscribed_at),
      email_bounced_at      = least(c.email_bounced_at, v_fill.email_bounced_at)
    WHERE c.id = v_survivor;

    v_merged := v_merged + coalesce(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_contacts_by_email() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts_by_email() FROM PUBLIC;

SELECT public.merge_duplicate_contacts_by_email();

-- 3) A garantia: vale para todo caminho de escrita (API, formulário, CSV...).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_email_unico
  ON contacts (account_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';
