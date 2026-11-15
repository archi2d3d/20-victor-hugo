CREATE TABLE vh_audience_counts (
 day date NOT NULL,
 dimension text NOT NULL,
 label text NOT NULL,
 count bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(day, dimension, label)
);
CREATE TABLE vh_audience_seen (
 day date NOT NULL,
 kind text NOT NULL,
 token text NOT NULL,
 PRIMARY KEY(day, kind, token)
);
