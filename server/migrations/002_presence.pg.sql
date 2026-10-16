CREATE TRIGGER att_hist_append_only BEFORE UPDATE OR DELETE ON attendance_history FOR EACH ROW EXECUTE FUNCTION noria_append_only();
CREATE TRIGGER conflict_append_only BEFORE UPDATE OR DELETE ON sync_conflict FOR EACH ROW EXECUTE FUNCTION noria_append_only();
