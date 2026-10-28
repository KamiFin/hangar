CREATE TABLE aircraft (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tail_number  VARCHAR(10)  NOT NULL,
  model        VARCHAR(40)  NOT NULL,
  base         CHAR(4)      NOT NULL COMMENT 'ICAO airport code',
  status       ENUM('READY', 'MAINTENANCE', 'GROUNDED') NOT NULL DEFAULT 'READY',
  flight_hours DECIMAL(9, 1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aircraft_tail (tail_number)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE flights (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aircraft_id  INT UNSIGNED    NOT NULL,
  origin       CHAR(4)         NOT NULL,
  destination  CHAR(4)         NOT NULL,
  departed_at  DATETIME        NOT NULL COMMENT 'UTC',
  duration_min SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  -- "recent flights of one aircraft": equality on aircraft_id, then ordered by time
  KEY idx_flights_aircraft_departed (aircraft_id, departed_at),
  -- keyset pagination over the whole fleet: ORDER BY departed_at DESC, id DESC
  KEY idx_flights_departed (departed_at, id),
  CONSTRAINT fk_flights_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE work_orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aircraft_id     INT UNSIGNED    NOT NULL,
  title           VARCHAR(120)    NOT NULL,
  severity        ENUM('LOW', 'MEDIUM', 'CRITICAL') NOT NULL,
  status          ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  -- NULL for rows created without the header; UNIQUE allows many NULLs in InnoDB
  idempotency_key CHAR(36)        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'UTC',
  PRIMARY KEY (id),
  UNIQUE KEY uq_work_orders_idempotency (idempotency_key),
  KEY idx_work_orders_aircraft_status (aircraft_id, status),
  CONSTRAINT fk_work_orders_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircraft (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
