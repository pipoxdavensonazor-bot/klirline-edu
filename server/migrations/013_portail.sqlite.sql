CREATE TRIGGER portal_image_no_update BEFORE UPDATE ON portal_image BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER portal_image_no_delete BEFORE DELETE ON portal_image BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER portal_item_no_delete BEFORE DELETE ON portal_item BEGIN SELECT RAISE(ABORT, 'contenu du portail : suppression interdite'); END;
