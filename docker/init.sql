-- Runs once, on first start of an empty data volume.
-- The test suite uses its own database so it never touches the demo data.
CREATE DATABASE IF NOT EXISTS hangar_test CHARACTER SET utf8mb4;
GRANT ALL PRIVILEGES ON hangar_test.* TO 'hangar'@'%';
FLUSH PRIVILEGES;
