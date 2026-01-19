SELECT (SELECT COUNT(*) FROM profiles) as profiles_count, (SELECT COUNT(*) FROM tickets) as tickets_count;
