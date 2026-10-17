CREATE TRIGGER transcript_guard BEFORE UPDATE ON transcript
  WHEN OLD.status IN ('annule','refuse') OR (OLD.status = 'emis' AND (NEW.pdf IS NOT OLD.pdf OR NEW.sha256 IS NOT OLD.sha256
    OR NEW.signature IS NOT OLD.signature OR NEW.code IS NOT OLD.code OR NEW.student_id <> OLD.student_id))
  BEGIN SELECT RAISE(ABORT, 'relevé figé : seule une annulation motivée est permise'); END;
