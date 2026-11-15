CREATE TABLE vh_pageviews (
 id uuid PRIMARY KEY,
 happened_at timestamptz NOT NULL DEFAULT now(),
 visitor text NOT NULL,
 session text NOT NULL,
 page text NOT NULL,
 source text NOT NULL,
 campaign text NOT NULL DEFAULT '',
 country text NOT NULL DEFAULT '',
 city text NOT NULL DEFAULT ''
);
CREATE INDEX vh_pageviews_date ON vh_pageviews(happened_at);
