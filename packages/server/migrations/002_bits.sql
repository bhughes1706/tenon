-- §3.5 / §9 — router bit inventory (chunk 17). Seeded + user-editable, mirrors species
-- (§8): the store is inventory, not a live geometry dependency — picking a bit just fills
-- an edge profile's dimension fields, which are then denormalized onto the board.
CREATE TABLE bits (
  id TEXT PRIMARY KEY,                      -- bit_roundover_14
  name TEXT NOT NULL,
  profile TEXT NOT NULL,                    -- roundover | chamfer | cove | ogee | rabbet
  radius REAL,                              -- roundover / cove / ogee
  angle_deg REAL,                           -- chamfer (45 for all seeds)
  cut_width REAL,                           -- chamfer leg / rabbet width
  cut_depth REAL,                           -- rabbet depth capacity
  shank TEXT DEFAULT '1/4',                 -- '1/4' | '1/2'
  brand TEXT,
  notes TEXT
);

-- Seed set (§5): roundovers 1/8–1/2", chamfer 45° ×2 widths, coves 1/4 & 1/2, Roman
-- ogees 5/32 & 1/4, rabbeting 3/8". radius/cut_width in decimal inches.
INSERT INTO bits (id, name, profile, radius, angle_deg, cut_width, cut_depth, shank, brand, notes) VALUES
  ('bit_roundover_18', 'Roundover 1/8"',   'roundover', 0.125,  NULL, NULL,  NULL,  '1/4', NULL, NULL),
  ('bit_roundover_14', 'Roundover 1/4"',   'roundover', 0.25,   NULL, NULL,  NULL,  '1/4', NULL, NULL),
  ('bit_roundover_38', 'Roundover 3/8"',   'roundover', 0.375,  NULL, NULL,  NULL,  '1/2', NULL, NULL),
  ('bit_roundover_12', 'Roundover 1/2"',   'roundover', 0.5,    NULL, NULL,  NULL,  '1/2', NULL, NULL),
  ('bit_chamfer_45_14','Chamfer 45° 1/4"', 'chamfer',   NULL,   45,   0.25,  NULL,  '1/4', NULL, NULL),
  ('bit_chamfer_45_12','Chamfer 45° 1/2"', 'chamfer',   NULL,   45,   0.5,   NULL,  '1/2', NULL, NULL),
  ('bit_cove_14',      'Cove 1/4"',        'cove',      0.25,   NULL, NULL,  NULL,  '1/4', NULL, NULL),
  ('bit_cove_12',      'Cove 1/2"',        'cove',      0.5,    NULL, NULL,  NULL,  '1/2', NULL, NULL),
  ('bit_ogee_532',     'Roman Ogee 5/32"', 'ogee',      0.15625,NULL, NULL,  NULL,  '1/4', NULL, NULL),
  ('bit_ogee_14',      'Roman Ogee 1/4"',  'ogee',      0.25,   NULL, NULL,  NULL,  '1/2', NULL, NULL),
  ('bit_rabbet_38',    'Rabbeting 3/8"',   'rabbet',    NULL,   NULL, 0.375, 0.5,   '1/2', NULL, NULL);
