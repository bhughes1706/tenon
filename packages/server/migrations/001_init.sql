-- §8 Species database
CREATE TABLE species (
  id TEXT PRIMARY KEY,               -- spc_red_oak
  common_name TEXT NOT NULL,
  botanical TEXT,
  kind TEXT NOT NULL DEFAULT 'solid',  -- solid | sheet
  density_lb_ft3 REAL,
  janka_lbf INTEGER,
  shrink_tan_pct REAL,               -- green→OD tangential
  shrink_rad_pct REAL,
  cost_bf REAL NOT NULL,             -- $/bf; $/sheet for sheet goods
  thicknesses TEXT NOT NULL,         -- JSON array: ["4/4","5/4","8/4"]
  texture TEXT,
  notes TEXT
);

-- §8 seed set
INSERT INTO species VALUES
  ('spc_red_oak',     'Red Oak',              'Quercus rubra',          'solid', 44.0, 1290, 8.6, 4.0, 5.50,  '["4/4","5/4","6/4","8/4","10/4","12/4"]', NULL, NULL),
  ('spc_white_oak',   'White Oak',            'Quercus alba',           'solid', 47.0, 1360, 10.5, 5.6, 6.50, '["4/4","5/4","6/4","8/4","10/4","12/4"]', NULL, NULL),
  ('spc_hard_maple',  'Hard Maple',           'Acer saccharum',         'solid', 44.0, 1450, 9.9, 4.8, 6.00,  '["4/4","5/4","6/4","8/4","10/4","12/4"]', NULL, NULL),
  ('spc_soft_maple',  'Soft Maple',           'Acer rubrum',            'solid', 38.0, 950,  7.2, 4.1, 4.25,  '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_black_cherry','Black Cherry',         'Prunus serotina',        'solid', 35.0, 950,  8.2, 3.7, 8.00,  '["4/4","5/4","6/4","8/4","10/4"]',        NULL, NULL),
  ('spc_black_walnut','Black Walnut',         'Juglans nigra',          'solid', 38.0, 1010, 7.8, 5.5, 12.00, '["4/4","5/4","6/4","8/4","10/4","12/4"]', NULL, NULL),
  ('spc_ash',         'Ash',                  'Fraxinus americana',     'solid', 41.0, 1320, 7.8, 4.9, 5.00,  '["4/4","5/4","6/4","8/4","10/4"]',        NULL, NULL),
  ('spc_poplar',      'Poplar',               'Liriodendron tulipifera','solid', 28.0, 540,  8.2, 4.6, 3.25,  '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_ew_pine',     'Eastern White Pine',   'Pinus strobus',          'solid', 25.0, 380,  6.1, 2.1, 2.75,  '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_sy_pine',     'Southern Yellow Pine', 'Pinus palustris',        'solid', 35.0, 1225, 7.5, 5.5, 3.00,  '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_hickory',     'Hickory',              'Carya spp.',             'solid', 51.0, 1820, 11.0, 7.0, 5.75, '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_sapele',      'Sapele',               'Entandrophragma cylindricum','solid',39.0,1410,7.2, 4.6, 9.00, '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_wr_cedar',    'Western Red Cedar',    'Thuja plicata',          'solid', 23.0, 350,  5.0, 2.4, 4.50,  '["4/4","5/4","6/4","8/4"]',               NULL, NULL),
  ('spc_bb_ply_12',   'Baltic Birch Ply 1/2"','Betula pendula',         'sheet', NULL, NULL, NULL, NULL, 55.00, '["1/2"]',                                 NULL, 'per sheet 5x5'),
  ('spc_bb_ply_34',   'Baltic Birch Ply 3/4"','Betula pendula',         'sheet', NULL, NULL, NULL, NULL, 70.00, '["3/4"]',                                 NULL, 'per sheet 5x5'),
  ('spc_mdf_34',      'MDF 3/4"',             NULL,                     'sheet', NULL, NULL, NULL, NULL, 45.00, '["3/4"]',                                 NULL, 'per sheet 4x8');

-- §9 Storage schema
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  notes TEXT,
  created_at TEXT
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lead',         -- lead|bid|accepted|in_progress|delivered|paid|archived
  deposit_pct REAL,                            -- e.g. 50.0; NULL = not yet agreed
  deposit_paid_at TEXT,                        -- ISO timestamp; NULL = not yet received
  payment_status TEXT DEFAULT 'unpaid',        -- unpaid|deposit_received|paid_in_full
  due_date TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),             -- NULL = standalone/library
  name TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,                           -- JSON model document (§3)
  thumbnail TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE model_snapshots (                 -- snapshot every 25 revs + on demand
  model_id TEXT,
  rev INTEGER,
  doc TEXT,
  created_at TEXT,
  PRIMARY KEY (model_id, rev)
);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  path TEXT NOT NULL,
  thumb_path TEXT,
  caption TEXT,
  taken_at TEXT,
  uploaded_at TEXT,
  exif TEXT                                    -- JSON
);

CREATE TABLE time_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  minutes INTEGER,
  category TEXT,   -- design|milling|joinery|assembly|finishing|install|other
  note TEXT,
  logged_at TEXT
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  body TEXT,
  created_at TEXT
);

CREATE TABLE hardware (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  model_id TEXT REFERENCES models(id),         -- NULL = job-level
  item TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'ea',                      -- ea|pair|set|box|ft
  unit_cost REAL,                              -- NULL = to be quoted
  supplier TEXT,
  notes TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                          -- JSON scalar or object; parsed on read
);

-- §9 settings seed rows
INSERT INTO settings VALUES
  ('theme',               '"system"'),
  ('density',             '"comfortable"'),
  ('snap_grid',           '0.0625'),
  ('fraction_precision',  '16'),
  ('default_species',     '"spc_red_oak"'),
  ('waste_factor_solid',  '0.20'),
  ('waste_factor_sheet',  '0.10'),
  ('labor_rate',          'null'),
  ('viewport_shadows',    'true');
