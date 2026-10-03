-- ============================================================
-- 036_profiles_protect_membership.sql
--
-- Fecha escalada de privilégio / invasão entre contas via `profiles`.
--
-- A policy `profiles_update` (017) deixa o usuário atualizar a PRÓPRIA
-- linha sem restringir colunas. Como a filiação à conta mora em
-- profiles.account_id + profiles.account_role, qualquer usuário logado
-- podia, só com a anon key:
--   - se promover a 'owner' na própria conta; ou
--   - trocar account_id para o UUID de OUTRA conta (exposto, p.ex., nos
--     links públicos de mídia `account-<uuid>/...`) e virar dono dela.
--
-- Correção: um trigger rejeita qualquer mudança de user_id, account_id
-- ou account_role feita diretamente pelos papéis do cliente
-- (`authenticated` / `anon`), e qualquer INSERT de perfil por eles
-- (o perfil nasce no trigger de signup). As mudanças legítimas
-- continuam passando, porque rodam com outro `current_user`:
--   - RPCs SECURITY DEFINER de 018/019 (set_member_role,
--     remove_account_member, transfer_account_ownership,
--     redeem_invitation) e o handle_new_user → dono da função;
--   - rotas de servidor com service_role → `service_role`.
-- Nome, avatar e demais campos do próprio perfil seguem editáveis.
--
-- O trigger NÃO é SECURITY DEFINER de propósito: current_user precisa
-- refletir quem executa o comando.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_profiles_protege_filiacao() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Perfis são criados apenas no cadastro.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.account_role IS DISTINCT FROM OLD.account_role THEN
    RAISE EXCEPTION 'Conta e papel só mudam pela gestão de membros.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION fn_profiles_protege_filiacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_protege_filiacao ON profiles;
CREATE TRIGGER trg_profiles_protege_filiacao BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_profiles_protege_filiacao();
